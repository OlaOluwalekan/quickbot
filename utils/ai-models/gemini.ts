"use server";

import {
  FunctionDeclarationSchemaType,
  GoogleGenerativeAI,
} from "@google/generative-ai";
import ActionResponse from "../response";

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY as string);
let model = gemini.getGenerativeModel({ model: "gemini-1.5-flash" });

export const countGeminiTokensUsed = async (prompt: string) => {
  try {
    const tokenCount = await model.countTokens(prompt);
    return ActionResponse.success("Counted tokens", {
      tokenCount: tokenCount.totalTokens,
    });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", null);
  }
};

export const getGeminiResponse = async (prompt: string) => {
  try {
    const response = model.generateContent(prompt);
    const result = (await response).response;
    const text = result.text();
    return ActionResponse.success("responded", { text });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", null);
  }
};

export const getGeminiChatResponse = async (
  prompt: string,
  history: any[] = []
) => {
  try {
    // const tokenCount = await countGeminiTokensUsed(prompt);
    const chat = model.startChat({ history });
    const result = await chat.sendMessage(prompt);
    const response = await result.response;
    const text = response.text();
    const tokenCount = response.usageMetadata?.totalTokenCount;
    // console.log(
    //   "TOKEN USED:",
    //   tokenCount.data.tokenCount,
    //   response.usageMetadata
    // );

    return ActionResponse.success("responded", { text, tokenCount });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", null);
  }
};

export const getGeminiJSONResponse = async (prompt: string) => {
  try {
    model = gemini.getGenerativeModel({
      model: "gemini-1.5-pro",
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: FunctionDeclarationSchemaType.ARRAY,
          items: {
            type: FunctionDeclarationSchemaType.OBJECT,
            properties: {
              category: { type: FunctionDeclarationSchemaType.STRING },
              prompt: {
                type: FunctionDeclarationSchemaType.STRING,
              },
            },
          },
        },
      },
    });
    let result = await model.generateContent(prompt);
    return ActionResponse.success("responded", {
      result: result.response.text(),
    });
  } catch (error) {
    console.log(error);
    return ActionResponse.error("failed to respond", null);
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
