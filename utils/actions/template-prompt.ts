'use server'

import { db } from '../db'
import ActionResponse from '../response'

let PROMPT = `List 4 short template prompts for a new chat`

/**
 * Asynchronously creates multiple template prompts in the database and retrieves them.
 *
 * @param prompts - An array of prompt objects to be created in the database.
 * @returns A promise that resolves to an ActionResponse object indicating the success or failure of the operation.
 *          On success, it includes the fetched template prompts.
 *          On failure, it includes an error message.
 */
export const createManyTemplatePrompts = async (prompts: any[]) => {
  try {
    await db.templatePrompt.createMany({
      data: prompts,
    })
    const templatePrompts = await db.templatePrompt.findMany({})
    return ActionResponse.success('Fetched template prompts', {
      templatePrompts,
    })
  } catch (error) {
    return ActionResponse.error('Failed to fetch template prompts', null)
  }
}

/**
 * Asynchronously deletes all template prompts from the database.
 *
 * This function attempts to remove all entries in the `templatePrompt` table.
 * It does not return any value or indicate success/failure, so it is assumed
 * to be used in contexts where the outcome does not need to be explicitly handled.
 */
export const deleteAllTemplatePrompts = async () => {
  try {
    await db.templatePrompt.deleteMany({})
  } catch (error) {}
}

/**
 * Asynchronously retrieves template prompts from the database.
 * If no prompts exist or if the prompts are outdated, it fetches new prompts from an external source and updates the database.
 *
 * @returns A promise that resolves to an ActionResponse object indicating the success or failure of the operation.
 *          On success, it includes the fetched template prompts.
 *          On failure, it includes an error message.
 */
// export const getTemplatePrompts = async () => {
//   try {
//     const prompts = await db.templatePrompt.findMany({});

//     if (prompts.length === 0) {
//       const geminiJSONResponse = await getGeminiJSONResponse(PROMPT);
//       const response = JSON.parse(geminiJSONResponse.data.result);
//       const templatePrompts = (await createManyTemplatePrompts(response)).data
//         .templatePrompts;
//       return ActionResponse.success("Fetched template prompts", {
//         templatePrompts,
//       });
//     }

//     const samplePrompt = prompts[0];
//     const dateCreated = new Date(samplePrompt.createAt);
//     const todaysDate = new Date();

//     // check if the prompt is not created in the same day then delete and recreate the prompt
//     if (dateCreated.toDateString() !== todaysDate.toDateString()) {
//       await deleteAllTemplatePrompts();

//       const geminiJSONResponse = await getGeminiJSONResponse(PROMPT);
//       const response = JSON.parse(geminiJSONResponse.data.result);
//       const templatePrompts = (await createManyTemplatePrompts(response)).data
//         .templatePrompts;
//       return ActionResponse.success("Fetched template prompts", {
//         templatePrompts,
//       });
//     }

//     return ActionResponse.success("Fetched template prompts", {
//       templatePrompts: prompts,
//     });
//   } catch (error) {
//     return ActionResponse.error("Failed to fetch template prompts", null);
//   }
// };
