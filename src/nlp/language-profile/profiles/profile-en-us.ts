import type { SplitCommand } from '@/nlp/language-profile/language-profile.types'

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
 */
export function splitRawCommands(rawCommand: string): SplitCommand[] {
  const prefixRegex =
    /^(?:would i be able to|could i|can i|is it possible to|may i|am i able to)\s*/i

  // sorry
  const splitRegex =
    /\b(?:(?:(?:(?:(?<!\b(?:mrs|mr|ms|mx|messrs|mmes|dr|prof|ph|ph\.?d|md|m\.?d|gen|col|maj|capt|lt|sgt|cpl|pvt|rev|fr|sr|br|rab|cant|mons|hon|gov|sen|rep|amb|pres|jr|sr|no|misc|approx|st|ave?|rd|ct|fl|blvd|br|ctr|ct|jct|pkwy|sq))\.)|\?|!|;|\?!|!\?|(?:\.{2,3}(?:\?|!|!\?|\?!)?))(?:\s+|$|\b)(?:(?:\s*,\s*)?(?:\s*(?:\band\b|&)\s*)?then)?)|(?:\s*(?:,\s*)?(?:\s*(?:\band\b|&)\s*)?then))/i

  let commands = rawCommand.split(splitRegex).flatMap((cmd) => {
    const trimmed = cmd.trim()
    return trimmed ? [trimmed] : []
  })

  let previousCommandIsDryRun = false

  return commands.map((cmd) => {
    const newCmd = cmd.replace(prefixRegex, '')

    previousCommandIsDryRun = previousCommandIsDryRun || newCmd.length !== cmd.length

    return {
      dryRun: previousCommandIsDryRun,
      raw: newCmd,
    }
  })
}
