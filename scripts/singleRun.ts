import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient()

const createMetadata = async () => {
  const meta = {
    tone: 'warm',
    formality: 'informal',
    emojiUsage: 'occasional',
    responseLength: 'medium',
    allowedTopics: ['everyday life', 'hobbies', 'feelings', 'advice'],
  }

  const metadata = await prisma.roleMetadata.create({
    data: {
      ...meta,
    },
  })

  return metadata
}

const createTemplateRole = async () => {
  const tempData = {
    roleId: 'friend',
    roleLabel: 'Friend',
    defaultName: 'Alex',
    //   gender: "MALE",
    basePrompt:
      'You are a friendly, empathetic friend. Speak casually, use emojis sparingly, and always offer encouragement and active listening.',
  }
  //   const roleId = 'friend'
  //   const roleLabel = 'Friend'
  //   const defaultName = 'John'
  //   const gender = 'MALE'
  //   const basePrompt =
  //     'You are a friend to in this chat and all your response should be friendly'
  const metadata = await createMetadata()

  const templateRole = await prisma.templateRole.create({
    data: {
      ...tempData,
      gender: 'MALE',
      metadataId: metadata.id,
      createdBy: '66b60957fd6a648ffb6048f3',
    },
  })

  console.log(templateRole)
}

createTemplateRole()
