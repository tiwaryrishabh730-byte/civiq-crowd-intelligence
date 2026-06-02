import { streamText, tool, convertToModelMessages, stepCountIs } from 'ai';
import { groq } from '@ai-sdk/groq';
import { firestore } from '@/lib/firebase';
import { collection, query, where, getDocs, updateDoc } from 'firebase/firestore';
import { z } from 'zod';

export const maxDuration = 30;

export async function POST(req: Request) {
  try {
    const { messages, isOperator } = await req.json();

    // Convert v3 UIMessages (parts-based) to ModelMessages for streamText
    const modelMessages = await convertToModelMessages(messages);

    const result = await streamText({
      model: groq('llama-3.3-70b-versatile'),
      messages: modelMessages,
      system:
        `You are the CIVIQ Intelligence Agent. Help users check real-time crowd status, traffic insights, and wait times. Always use tools to fetch database entries from Firebase when requested. CRITICAL SECURITY RULE: You can only call the 'updateCrowdData' tool if the operator flag is explicitly true. Current User Status: ${isOperator ? 'AUTHORIZED OPERATOR' : 'NORMAL USER'}. If a normal user tries to update data, refuse politely and do not call the tool.`,
      stopWhen: stepCountIs(5),
      tools: {
        getCrowdData: tool({
          description:
            'Fetch real-time crowd levels and wait times for a specified location.',
          inputSchema: z.object({
            location: z
              .string()
              .describe(
                'The exact name of the station or location, e.g., CST Station Ticket Counter',
              ),
          }),
          execute: async ({ location }: { location: string }) => {
            if (!firestore) {
              return { location, error: 'Database offline' };
            }
            try {
              const locationsRef = collection(firestore, 'locations');
              const q = query(locationsRef, where('name', '==', location));
              const querySnapshot = await getDocs(q);

              if (!querySnapshot.empty) {
                const docData = querySnapshot.docs[0].data();
                return {
                  location: docData.name,
                  crowdLevel: docData.status || 'Unknown',
                  estimatedWaitTime: `${docData.current_wait || 0} mins`,
                  reportedHeadcount: docData.reported_headcount || 0,
                  lat: docData.lat,
                  lng: docData.lng,
                };
              }

              // No exact match — guide the model to inform the user gracefully
              return {
                location,
                error:
                  'Location exact name mismatch in database records. Please try using standard names.',
              };
            } catch (error: any) {
              console.error('Firestore query error:', error);
              return {
                location,
                error: 'Database aggregation failed at this moment.',
              };
            }
          },
        }),

        updateCrowdData: tool({
          description:
            'Update real-time crowd status, wait times, or headcount for a location. ONLY accessible by authorized operators.',
          inputSchema: z.object({
            location: z
              .string()
              .describe(
                'The exact name of the station, e.g., CST Station Ticket Counter',
              ),
            newStatus: z
              .string()
              .optional()
              .describe('The new crowd level status (e.g., Busy, Moderate, Clear)'),
            newWaitTime: z
              .number()
              .optional()
              .describe('The updated estimated wait time in minutes'),
            newHeadcount: z
              .number()
              .optional()
              .describe('The updated reported headcount'),
          }),
          execute: async ({
            location,
            newStatus,
            newWaitTime,
            newHeadcount,
          }: {
            location: string;
            newStatus?: string;
            newWaitTime?: number;
            newHeadcount?: number;
          }) => {
            // Hard code-level auth guard — model instructions are the first layer;
            // this is the second, non-bypassable layer.
            if (!isOperator) {
              return {
                success: false,
                error:
                  'Unauthorized: Only station operators can modify database records.',
              };
            }
            if (!firestore) {
              return { success: false, error: 'Database offline' };
            }
            try {
              const locationsRef = collection(firestore, 'locations');
              const q = query(locationsRef, where('name', '==', location));
              const querySnapshot = await getDocs(q);

              if (!querySnapshot.empty) {
                const docRef = querySnapshot.docs[0].ref;
                const updateFields: Record<string, string | number> = {};

                if (newStatus !== undefined) updateFields.status = newStatus;
                if (newWaitTime !== undefined) updateFields.current_wait = newWaitTime;
                if (newHeadcount !== undefined)
                  updateFields.reported_headcount = newHeadcount;

                await updateDoc(docRef, updateFields);
                return { success: true, location, updatedFields: updateFields };
              }

              return { success: false, error: 'Location not found in database.' };
            } catch (err: any) {
              console.error('Update failed:', err);
              return { success: false, error: 'Database write failure.' };
            }
          },
        }),
      },
    });

    // v3 protocol: toUIMessageStreamResponse() instead of toDataStreamResponse()
    return result.toUIMessageStreamResponse();
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}
