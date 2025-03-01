import bcrypt from 'bcryptjs'

export const isMatch = async (password: string, hash: string) => {
  return await bcrypt.compare(password, hash)
}
