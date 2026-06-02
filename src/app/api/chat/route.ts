import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { groq } from '@ai-sdk/groq';
import { firestore } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { z } from 'zod';

export const maxDuration = 30;

type CrowdUpdateFields = {
  status?: string;
  current_wait?: number;
  reported_headcount?: number;
};

function firstProvided(input: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(input, key) && input[key] !== undefined) {
      return input[key];
    }
  }

  return undefined;
}

function buildCrowdUpdateFields(input: Record<string, unknown>): CrowdUpdateFields {
  const updateFields: CrowdUpdateFields = {};
  const status = firstProvided(input, ['newStatus', 'status', 'crowd_status', 'crowdStatus']);
  const waitTime = firstProvided(input, ['newWaitTime', 'waitTime', 'current_wait', 'currentWait']);
  const headcount = firstProvided(input, ['newHeadcount', 'headcount', 'reported_headcount', 'reportedHeadcount']);

  if (typeof status === 'string' && status.trim()) {
    updateFields.status = status.trim();
  }

  if (typeof waitTime === 'number' && Number.isFinite(waitTime)) {
    updateFields.current_wait = waitTime;
  }

  if (typeof headcount === 'number' && Number.isFinite(headcount)) {
    updateFields.reported_headcount = headcount;
  }

  return updateFields;
}

export async function POST(req: Request) {
  try {
    const { messages, isOperator } = await req.json();
    const modelMessages = await convertToModelMessages(messages);

    // Ensure firestore is available
    if (!firestore) {
      throw new Error("Firestore instance is not initialized.");
    }
    const db = firestore;

    const result = await streamText({
      model: groq('llama-3.3-70b-versatile'),
      messages: modelMessages,
      system: `You are the CIVIQ Intelligence Agent. Help users check real-time crowd status, traffic insights, and wait times. Always use tools to fetch database entries from Firebase when requested. CRITICAL SECURITY RULE: You can only call the 'updateCrowdData' tool if the operator flag is explicitly true. Current User Status: ${isOperator ? 'AUTHORIZED OPERATOR' : 'NORMAL USER'}. If a normal user tries to update data, refuse politely and do not call the tool.`,
      stopWhen: stepCountIs(5),
      tools: {
        getCrowdData: tool({
          description: 'Fetch real-time crowd levels and wait times for a specified location.',
          inputSchema: z.object({
            location: z.string().describe('The exact name of the station, e.g., CST Station Ticket Counter'),
          }),
          execute: async ({ location }) => {
            try {
              const q = query(collection(db, 'locations'), where('name', '==', location));
              const querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                const data = querySnapshot.docs[0].data();
                return {
                  location: data.name,
                  crowdLevel: data.status || 'Unknown',
                  estimatedWaitTime: `${data.current_wait || 0} mins`,
                  reportedHeadcount: data.reported_headcount || 0,
                };
              }
              return { error: 'Location not found.' };
            } catch (e) {
              return { error: 'Database error occurred.' };
            }
          },
        }),
        updateCrowdData: tool({
          description: 'Update real-time crowd status, wait times, or headcount for a location. Operators only.',
          inputSchema: z.object({
            location: z.string(),
          }).catchall(z.any()),
          execute: async (input) => {
            if (isOperator !== true) {
              return { success: false, error: 'Unauthorized.' };
            }

            const { location } = input;
            const updateFields = buildCrowdUpdateFields(input);

            if (Object.keys(updateFields).length === 0) {
              return { success: false, error: 'No valid update fields provided.' };
            }

            try {
              const q = query(collection(db, 'locations'), where('name', '==', location));
              const querySnapshot = await getDocs(q);
              if (!querySnapshot.empty) {
                await updateDoc(querySnapshot.docs[0].ref, updateFields);
                return { success: true, message: `Updated ${location} successfully.` };
              }
              return { success: false, error: 'Location not found.' };
            } catch (e) {
              return { success: false, error: 'Update failed.' };
            }
          },
        }),
      },
    });

    return result.toUIMessageStreamResponse();
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
