export default function chunkArray<T>(array: T[], chunkSize: number): T[][] {
  if (!Number.isSafeInteger(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive safe integer')
  }
  const chunks: T[][] = []

  for (let i = 0; i < array.length; i += chunkSize) {
    chunks.push(array.slice(i, i + chunkSize))
  }
  return chunks
}
