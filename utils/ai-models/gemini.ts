"use server";

import { GoogleGenerativeAI } from "@google/generative-ai";
import ActionResponse from "../response";

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
const model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

export const getGeminiResponse = async (prompt: string) => {
  try {
    const response = model.generateContent(prompt);
    const result = (await response).response;
    const text = result.text();
    return ActionResponse.success("responded", { text });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", { error });
  }
};

export const getGeminiChatResponse = async (
  prompt: string,
  history: any[] = []
) => {
  try {
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();
    return ActionResponse.success("responded", { text });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", { error });
  }
};

// export const getGeminiStreamResponse = async (prompt: string) => {
//   try {
//     const result = await model.generateContentStream(prompt);

//     for await (const chunk of result.stream) {
//       const chunkText = chunk.text();
//     }
//     return null;
//   } catch (error) {
//     console.log(error);

//     return { error: "something went wrong" };
//   }
// };
