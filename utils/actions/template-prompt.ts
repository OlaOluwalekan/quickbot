"use server";

import { getGeminiJSONResponse } from "../ai-models/gemini";
import { db } from "../db";
import ActionResponse from "../response";

let PROMPT = `List 4 short template prompts for a new chat`;

export const createManyTemplatePrompts = async (prompts: any[]) => {
  try {
    await db.templatePrompt.createMany({
      data: prompts,
    });
    const templatePrompts = await db.templatePrompt.findMany({});
    return ActionResponse.success("Fetched template prompts", {
      templatePrompts,
    });
  } catch (error) {
    return ActionResponse.error("Failed to fetch template prompts", null);
  }
};

export const deleteAllTemplatePrompts = async () => {
  try {
    await db.templatePrompt.deleteMany({});
  } catch (error) {}
};

export const getTemplatePrompts = async () => {
  try {
    const prompts = await db.templatePrompt.findMany({});
    // let response:

    if (prompts.length === 0) {
      const geminiJSONResponse = await getGeminiJSONResponse(PROMPT);
      const response = JSON.parse(geminiJSONResponse.data.result);
      const templatePrompts = (await createManyTemplatePrompts(response)).data
        .templatePrompts;
      return ActionResponse.success("Fetched template prompts", {
        templatePrompts,
      });
    }

    const samplePrompt = prompts[0];
    const dateCreated = new Date(samplePrompt.createAt);
    const todaysDate = new Date();

    if (dateCreated.toDateString() !== todaysDate.toDateString()) {
      await deleteAllTemplatePrompts();

      const geminiJSONResponse = await getGeminiJSONResponse(PROMPT);
      const response = JSON.parse(geminiJSONResponse.data.result);
      const templatePrompts = (await createManyTemplatePrompts(response)).data
        .templatePrompts;
      return ActionResponse.success("Fetched template prompts", {
        templatePrompts,
      });
    }

    return ActionResponse.success("Fetched template prompts", {
      templatePrompts: prompts,
    });
  } catch (error) {
    return ActionResponse.error("Failed to fetch template prompts", null);
  }
};
