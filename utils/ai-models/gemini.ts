"use server";

// import {
//   FunctionDeclarationSchemaType,
//   GoogleGenerativeAI,
// } from "@google/generative-ai";
import {GoogleGenAI as GoogleGenerativeAI} from "@google/genai"
import ActionResponse from "../response";

const model = 'gemini-1.5-flash'

// initialize a new instance of the Google generative AI service
const gemini = new GoogleGenerativeAI({apiKey: process.env.GEMINI_API_KEY as string});
// create a model
// let model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Asynchronously counts the number of tokens used in a given prompt using the Gemini model.
 *
 * @param {string} prompt - The input string for which the token count is to be calculated.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse object
 * indicating success with the token count or an error if the operation fails.
 */
export const countGeminiTokensUsed = async (
  prompt: string
): Promise<ActionResponse<any>> => {
  try {
    // const tokenCount = await model.countTokens(prompt);
    const tokenCount = await gemini.models.countTokens({
      model,
      contents: prompt
    })
    return ActionResponse.success("Counted tokens", {
      tokenCount: tokenCount.totalTokens,
    });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", null);
  }
};

/**
 * Asynchronously generates a response using the Gemini model based on the provided prompt.
 *
 * @param {string} prompt - The input string for which the response is to be generated.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse object
 * indicating success with the generated text or an error if the operation fails.
 */
export const getGeminiResponse = async (
  prompt: string
): Promise<ActionResponse<any>> => {
  try {
    const response = await gemini.models.generateContent({
      model,
      contents: prompt
    })
    // const response = model.generateContent(prompt);
    // const result = (await response).response;
    // const text = result.text();
    return ActionResponse.success("responded", { text: response.text });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", null);
  }
};

/**
 * Asynchronously generates a chat response using the Gemini model based on the provided prompt and chat history.
 *
 * @param {string} prompt - The input string for which the chat response is to be generated.
 * @param {any[]} history - An optional array representing the chat history to provide context for the response.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse object
 * indicating success with the generated text and token count, or an error if the operation fails.
 */
export const getGeminiChatResponse = async (
  prompt: string,
  history: any[] = []
): Promise<ActionResponse<any>> => {
  try {
    const existingChat = gemini.chats.create({
      model,
      history,
    })
    const response = await existingChat.sendMessage({
      message: prompt
    })
    const tokenCount = response.usageMetadata?.totalTokenCount;

    return ActionResponse.success("responded", { text: response.text, tokenCount });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", null);
  }
};

/**
 * Asynchronously generates a JSON response using the Gemini model based on the provided prompt.
 *
 * @param {string} prompt - The input string for which the JSON response is to be generated.
 * @returns {Promise<ActionResponse>} A promise that resolves to an ActionResponse object
 * indicating success with the generated JSON text or an error if the operation fails.
 */
// export const getGeminiJSONResponse = async (
//   prompt: string
// ): Promise<ActionResponse<any>> => {
//   try {
//     model = gemini.getGenerativeModel({
//       model: "gemini-1.5-pro",
//       generationConfig: {
//         responseMimeType: "application/json",
//         responseSchema: {
//           type: FunctionDeclarationSchemaType.ARRAY,
//           items: {
//             type: FunctionDeclarationSchemaType.OBJECT,
//             properties: {
//               category: { type: FunctionDeclarationSchemaType.STRING },
//               prompt: {
//                 type: FunctionDeclarationSchemaType.STRING,
//               },
//             },
//           },
//         },
//       },
//     });
//     let result = await model.generateContent(prompt);
//     return ActionResponse.success("responded", {
//       result: result.response.text(),
//     });
//   } catch (error) {
//     console.log(error);
//     return ActionResponse.error("failed to respond", null);
//   }
// };
