'use server'

import { db } from '../db'

export const createTemplateRole = async (
  roleId: string,
  roleLabel: string,
  defaultName: string,
  gender: 'MALE' | 'FEMALE',
  basePrompt: string,
  metadataId: string
) => {
  const templateRole = await db.templateRole.create({
    data: {
      roleId,
      roleLabel,
      defaultName,
      gender,
      basePrompt,
      metadataId,
      createdBy: '66b60957fd6a648ffb6048f3',
    },
  })

  return templateRole
}
