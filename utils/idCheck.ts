export const isValidMongoID = (id: string) => {
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id)
}
