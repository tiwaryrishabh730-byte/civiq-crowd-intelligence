import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { groq } from '@ai-sdk/groq';
import { firestore } from '@/lib/firebase';
import { getAdminAuth } from '@/lib/firebase-admin';
import { collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { z } from 'zod';

export const maxDuration = 30;

type AuthContext = {
  token?: string;
  userId?: string;
  email?: string;
};

type ToolErrorCode =
  | 'Unauthorized'
  | 'Missing required field'
  | 'Validation error'
  | 'Location not found'
  | 'Database error';

type CrowdUpdatePayload = {
  status?: string;
  current_wait?: number;
  reported_headcount?: number;
};

const numberLikeSchema = z.union([z.number(), z.string()]);

const updateCrowdDataInputSchema = z.object({
  location: z.string().optional(),
  place: z.string().optional(),
  venue: z.string().optional(),
  station: z.string().optional(),
  name: z.string().optional(),
  newStatus: z.string().optional(),
  status: z.string().optional(),
  crowd_status: z.string().optional(),
  crowdStatus: z.string().optional(),
  newWaitTime: numberLikeSchema.optional(),
  waitTime: numberLikeSchema.optional(),
  current_wait: numberLikeSchema.optional(),
  currentWait: numberLikeSchema.optional(),
  newHeadcount: numberLikeSchema.optional(),
  headcount: numberLikeSchema.optional(),
  reported_headcount: numberLikeSchema.optional(),
  reportedHeadcount: numberLikeSchema.optional(),
}).catchall(z.any());

function toolError(code: ToolErrorCode, message: string, details?: Record<string, unknown>) {
  return {
    success: false,
    error: {
      code,
      message,
      details,
    },
  };
}

const operatorEmail = process.env.OPERATOR_EMAIL?.trim().toLowerCase();

const UNAUTHORIZED_OPERATOR_MESSAGE = 'Unauthorized: Not an operator';

/** Verifies the caller's Firebase ID token and matches email to OPERATOR_EMAIL. */
async function isAuthorized(token?: string): Promise<boolean> {
  if (!operatorEmail || !token) {
    return false;
  }

  try {
    const decodedToken = await getAdminAuth().verifyIdToken(token);
    const tokenEmail = decodedToken.email?.trim().toLowerCase();
    return Boolean(tokenEmail && tokenEmail === operatorEmail);
  } catch {
    return false;
  }
}

function bearerTokenFrom(req: Request) {
  const authorization = req.headers.get('authorization');
  if (!authorization) {
    return undefined;
  }

  const [scheme, token] = authorization.split(' ');
  return scheme?.toLowerCase() === 'bearer' && token ? token : undefined;
}

function authContextFrom(req: Request): AuthContext {
  return { token: bearerTokenFrom(req) };
}

function firstProvided(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      return input[key];
    }
  }

  return undefined;
}

function toNonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function toFiniteNumber(value: unknown) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  return undefined;
}

function normalizeUpdateInput(input: Record<string, unknown>) {
  const location = toNonEmptyString(firstProvided(input, ['location', 'place', 'venue', 'station', 'name']));
  const payload: CrowdUpdatePayload = {
    status: toNonEmptyString(firstProvided(input, ['newStatus', 'status', 'crowd_status', 'crowdStatus'])),
    current_wait: toFiniteNumber(firstProvided(input, ['newWaitTime', 'waitTime', 'current_wait', 'currentWait'])),
    reported_headcount: toFiniteNumber(
      firstProvided(input, ['newHeadcount', 'headcount', 'reported_headcount', 'reportedHeadcount']),
    ),
  };
  const updatePayload = Object.fromEntries(
    Object.entries(payload).filter(([, value]) => value !== undefined),
  ) as CrowdUpdatePayload;

  return { location, updatePayload };
}

function buildSystemPrompt(authContext: AuthContext) {
  return `You are the CIVIQ Intelligence Agent. Help users check real-time crowd status, traffic insights, and wait times.

Tools:
- getCrowdData: use for reading crowd data. Required parameter: location.
- updateCrowdData: use only for verified operators. Expected parameters are:
  - location: exact location name.
  - status or newStatus or crowd_status: crowd level/status text.
  - waitTime or newWaitTime or current_wait: wait time in minutes.
  - headcount or newHeadcount or reported_headcount: observed people count.

Rules:
- If the user query is ambiguous, do not guess; ask for clarification.
- If the user is not an operator, do not attempt the updateCrowdData tool call.
- Never invent location names. Ask for the exact public place if it is missing.

Current server auth state: ${authContext.token ? 'Firebase ID token supplied for server verification' : 'no Firebase ID token supplied'}.`;
}

export async function POST(req: Request) {
  try {
    const body = await req.json() as Record<string, unknown>;
    const { messages } = body;
    const authContext = authContextFrom(req);

    if (!Array.isArray(messages)) {
      throw new Error('Validation error: request body must include a messages array.');
    }

    const modelMessages = await convertToModelMessages(
      messages as Parameters<typeof convertToModelMessages>[0],
    );

    if (!firestore) {
      throw new Error('Database error: Firestore instance is not initialized.');
    }
    const db = firestore;

    const result = await streamText({
      model: groq('llama-3.3-70b-versatile'),
      messages: modelMessages,
      system: buildSystemPrompt(authContext),
      stopWhen: stepCountIs(5),
      tools: {
        getCrowdData: tool({
          description: 'Fetch real-time crowd levels and wait times for a specified location.',
          inputSchema: z.object({
            location: z.string().describe('The exact name of the station, e.g., CST Station Ticket Counter'),
          }).catchall(z.any()),
          execute: async ({ location }) => {
            try {
              const q = query(collection(db, 'locations'), where('name', '==', location));
              const querySnapshot = await getDocs(q);

              if (querySnapshot.empty) {
                return toolError('Location not found', `No crowd data exists for "${location}".`, { location });
              }

              const data = querySnapshot.docs[0].data();
              return {
                success: true,
                location: data.name,
                crowdLevel: data.status || 'Unknown',
                estimatedWaitTime: `${data.current_wait || 0} mins`,
                reportedHeadcount: data.reported_headcount || 0,
              };
            } catch (error) {
              return toolError('Database error', 'Unable to read crowd data from Firebase.', {
                cause: error instanceof Error ? error.message : 'Unknown database error',
              });
            }
          },
        }),
        updateCrowdData: tool({
          description: 'Update crowd status, wait time, or headcount for a location. Requires verified operator auth.',
          inputSchema: updateCrowdDataInputSchema,
          execute: async (input) => {
            const authorized = await isAuthorized(authContext.token);

            if (!authorized) {
              return toolError('Unauthorized', UNAUTHORIZED_OPERATOR_MESSAGE, { status: 403 });
            }

            const { location, updatePayload } = normalizeUpdateInput(input);

            if (!location) {
              return toolError('Missing required field', 'A location is required before crowd data can be updated.', {
                acceptedAliases: ['location', 'place', 'venue', 'station', 'name'],
              });
            }

            if (Object.keys(updatePayload).length === 0) {
              return toolError(
                'Validation error',
                'At least one valid update field is required: status, wait time, or headcount.',
                {
                  acceptedAliases: [
                    'newStatus',
                    'status',
                    'crowd_status',
                    'newWaitTime',
                    'waitTime',
                    'current_wait',
                    'newHeadcount',
                    'headcount',
                    'reported_headcount',
                  ],
                },
              );
            }

            try {
              const q = query(collection(db, 'locations'), where('name', '==', location));
              const querySnapshot = await getDocs(q);

              if (querySnapshot.empty) {
                return toolError('Location not found', `Cannot update "${location}" because it was not found.`, {
                  location,
                });
              }

              await updateDoc(querySnapshot.docs[0].ref, updatePayload);
              return {
                success: true,
                message: `Updated ${location} successfully.`,
                updatedFields: updatePayload,
              };
            } catch (error) {
              return toolError('Database error', `Unable to update crowd data for "${location}".`, {
                cause: error instanceof Error ? error.message : 'Unknown database error',
              });
            }
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (error) {
    return new Response(
      JSON.stringify({
        error: {
          code: 'Route error',
          message: error instanceof Error ? error.message : 'Unexpected chat route failure.',
        },
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }
}
