import type { GrammarExtract, SplitCommand } from '@/nlp/language-profile/language-profile.types'
import nlp from 'compromise'

/**
 * Takes in the player's raw command exactly as typed, and returns an array of
 * objects containing individual commands, and flags indicating whether they are interrogative/dry runs.
 *
 * Commands are split on hard stops (.;!?) as well as the word(s) "then" / "and then" / "& then"
 *
 * Terms indicating interrogative ("can I", "is it possible to", etc), as well as punctuation marks, are stripped
 *
 * Note: if a command in a compound command is interrogative, e.g. "can i take the sword, then attack the goblin?"
 * the latter commands should be considered interrogative too, even if they don't contain a prefix indicating it
 *
 * No-op extras like "I want to" are silently stripped
 */
export function splitRawCommands(rawCommand: string): SplitCommand[] {
  const prefixRegex =
    /^(?:would i be able to|could i|can i|is it possible to|may i|am i able to)\s*/i

  // sorry
  const splitRegex =
    /\b(?:(?:(?:(?:(?<!\b(?:mrs|mr|ms|mx|messrs|mmes|dr|prof|ph|ph\.?d|md|m\.?d|gen|col|maj|capt|lt|sgt|cpl|pvt|rev|fr|sr|br|rab|cant|mons|hon|gov|sen|rep|amb|pres|jr|sr|no|misc|approx|st|ave?|rd|ct|fl|blvd|br|ctr|ct|jct|pkwy|sq))\.)|\?|!|;|\?!|!\?|(?:\.{2,3}(?:\?|!|!\?|\?!)?))(?:\s+|$|\b)(?:(?:\s*,\s*)?(?:\s*(?:\band\b|&)\s*)?then)?)|(?:\s*(?:,\s*)?(?:\s*(?:\band\b|&)\s*)?then))/i

  const noopStripRegex = /(i want to)|(i wanna)/i
  let commands = rawCommand.split(splitRegex).flatMap((cmd) => {
    const trimmed = cmd.trim()
    return trimmed ? [trimmed] : []
  })

  let previousCommandIsDryRun = false

  return commands.map((cmd) => {
    const newCmd = cmd.replace(prefixRegex, '')

    previousCommandIsDryRun = previousCommandIsDryRun || newCmd.length !== cmd.length

    const newCmdStripped = newCmd.replace(noopStripRegex, '')

    return {
      dryRun: previousCommandIsDryRun,
      raw: newCmd,
    }
  })
}

/**
 * Given a raw command (which has already been split, i.e. is not a compound command),
 * extracts the words which represent the target(s), action, and tool(s)
 * that the player is expressing. Verbs are converted to infinitive form.
 * Adverbs are included in the action output, so the NLP module can
 * map actions using appropriate context, e.g. "slowly walk" might be mapped onto "SNEAK".
 * Commands must already be stripped of text that indicates a dry run, e.g. "Can I walk to the door?"
 * must already be transformed into "walk to the door" before it reaches this method.
 *
 *
 * @param command the command to extract target(s), action, and tool(s) from
 */
export function extractGrammar(command: string): GrammarExtract {
  const doc = nlp(command)
  const verbsArray = doc.verbs().toInfinitive().out('array')
  console.log(verbsArray)

}
