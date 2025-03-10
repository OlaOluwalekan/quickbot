'use server'

import { revalidatePath } from 'next/cache'
import { getGeminiChatResponse } from '../ai-models/gemini'
import { db } from '../db'
import ActionResponse from '../response'
import { createChat } from './chat'
import { createTokenUsage, updateUserToken } from './response-token'

/**
 * Asynchronously retrieves a response from an AI service based on the provided form data and page context.
 *
 * @param {FormData} formData - The form data containing the user's question and other relevant information.
 * @param {string} page - The current page context, used to determine the chat or response flow.
 * @param {number} existingToken - The number of tokens available for the user, used to validate token usage.
 *
 * @returns {Promise<ActionResponse>} - A promise that resolves to an ActionResponse indicating success or failure.
 */
export const getResponseFromAI = async (
  formData: FormData,
  page: string,
  existingToken: number
): Promise<ActionResponse<any>> => {
  // get form data
  const prompt = formData.get('question')
  const id = formData.get('id')

  let chatId: string = ''
  let history: any[] = []

  if (!prompt) {
    return ActionResponse.error('Prompt is required', null)
  }

  if (existingToken <= 0) {
    return ActionResponse.error('You are out of token, Please purchase', null)
  }

  // check if the current page is the general chat page and hence
  // create a new chat
  if (page === '/chat') {
    const chatResponse = await createChat(id as string, prompt as string)
    chatId = chatResponse.data.chatId
  } else {
    // if the current page is a dynamic chat page, then get the chatId and add the response to the existing chat
    chatId = page.split('/').pop() as string
    const responsesResponse = await getResponses(chatId)
    const responses = responsesResponse.data.responses

    //  * Iterates over each response in the responses array and processes it.
    //  * For each response, creates two objects representing a user and a model interaction,
    //  * and then pushes these objects into the history array.
    responses.forEach((response: any) => {
      let first = {
        role: 'user',
        parts: [{ text: response.question }],
      }
      let second = {
        role: 'model',
        parts: [{ text: response.response }],
      }
      history.push(first, second)
    })
  }

  try {
    // get the ai response
    const response = await getGeminiChatResponse(prompt as string, history)
    const res = await createResponse(
      chatId,
      prompt as string,
      response.data.text
    )

    // count token used in the response
    const tokenUsed: number = response.data.tokenCount
    await createTokenUsage(id as string, tokenUsed, res.data.res)
    // update the user's token count and revalidate the cache
    await updateUserToken(id as string, existingToken - tokenUsed)
    revalidatePath('/chat')
    revalidatePath(`/chat/${chatId}`)
    return ActionResponse.success('responded', {
      text: response.data.text,
      chatId,
    })
  } catch (error) {
    return ActionResponse.error('failed to respond', { error })
  }
}

/**
 * Asynchronously retrieves responses from the database for a given chat ID.
 *
 * @param {string} chatId - The unique identifier for the chat whose responses are to be fetched.
 *
 * @returns {Promise<ActionResponse>} - A promise that resolves to an ActionResponse indicating success or failure.
 * On success, it contains the fetched responses. On failure, it contains an error message.
 */
export const getResponses = async (
  chatId: string
): Promise<ActionResponse<any>> => {
  try {
    const responses = await db.response.findMany({
      where: {
        chatId: chatId,
      },
    })
    return ActionResponse.success('Fetched responses', { responses })
  } catch (error) {
    return ActionResponse.error('Failed to fetch responses', null)
  }
}

/**
 * Asynchronously creates a new response in the database and updates the chat's last updated timestamp.
 *
 * @param {string} chatId - The unique identifier for the chat to which the response belongs.
 * @param {string} question - The question or prompt that was asked in the chat.
 * @param {string} response - The response generated for the given question.
 *
 * @returns {Promise<ActionResponse>} - A promise that resolves to an ActionResponse indicating success or failure.
 * On success, it contains the created response data. On failure, it contains an error message.
 */
const createResponse = async (
  chatId: string,
  question: string,
  response: string
): Promise<ActionResponse<any>> => {
  try {
    const res = await db.response.create({
      data: {
        chatId,
        question,
        response,
      },
    })

    await db.chat.update({
      where: {
        id: chatId,
      },
      data: {
        updatedAt: new Date(),
      },
    })
    return ActionResponse.success('Created response', { res })
  } catch (error) {
    return ActionResponse.error('Failed to create response', null)
  }
}
