export interface SplitCommand {
  dryRun: boolean
  raw: string
}

export interface GrammarExtract {
  action: string
  targets: string[]
  tools: string[]
}
