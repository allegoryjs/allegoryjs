import { describe, expect, it } from 'bun:test'
import { splitRawCommands } from '@/nlp/language-profile/profiles/profile-en-us'

describe('profile-en-us', () => {
  describe('splits commands correctly', () => {
    it('contains a malformed command', () => {
      // eztodo
    })

    describe('when the command contains', () => {
      const baseCommandOne = 'take the sword'
      const baseCommandTwo = 'attack the goblin'
      const baseCommandThree = 'heal using the potion'

      describe('interrogative', () => {
        const interrogativePrefixes = [
          'would i be able to',
          'am i able to',
          'could i',
          'can i',
          'is it possible to',
          'may i',
        ]
    
        const punctuation = ['.', ';', '!', '?', '!?', '?!']
    
        const compoundDelimiters = (() => {
          // generate delimiters including cases where there are multiple spaces between delimiter and 'then'
          return punctuation
            .concat(
              [...punctuation].flatMap((punc) =>
                [1, 2, 3].map((spaces) => `${punc}${' '.repeat(spaces)}then`),
              ),
            )
            .concat([0, 1, 2, 3].map((spaces) => `,${' '.repeat(spaces)}then`))
            .concat([1, 2, 3].map((spaces) => `, and${' '.repeat(spaces)}then`))
            .concat([1, 2, 3].map((spaces) => `, &${' '.repeat(spaces)}then`))
        })()

        it('single commands', () => {
          let questions = interrogativePrefixes.map(
            (prefix) => `${prefix} ${baseCommandOne}`,
          )
          
          questions = questions.concat(
            ...questions.map(
              q => punctuation.map(punc => `${q}${punc}`)
            )
          )
    
          questions.forEach((q) => {
            const split = splitRawCommands(q)
            expect(split.length).toBe(1)
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: true, raw: 'take the sword' }),
            )
          })
        })
    
        it('compound commands', () => {
          // eztodo include 2 & 3 commands, and question mark versions
          // eztodo support ... and ...? and ...! and ...?! and ...!?
    
          let questions = interrogativePrefixes
            .map((prefix) => `${prefix} ${baseCommandOne}`)
            .flatMap((questionPartOne) =>
              compoundDelimiters.map(
                (delimiter) => `${questionPartOne}${delimiter} ${baseCommandTwo}`,
              ),
            )
    
          const twoQuestions = questions.concat(
            ...questions.map(
              q => punctuation.map(punc => `${q}${punc}`)
            )
          )
    
          const threeQuestionsWithoutPunctuation =
            questions.flatMap(
              q => compoundDelimiters.map(
                (delimiter) => `${q}${delimiter} ${baseCommandThree}`
              )
            )
    
          const threeQuestionsWithPunctuation = threeQuestionsWithoutPunctuation.concat(
            threeQuestionsWithoutPunctuation.flatMap(
              q => punctuation.map(punc => `${q}${punc}`)
            )
          )
    
          const threeQuestions = [
            ...threeQuestionsWithPunctuation,
            ...threeQuestionsWithoutPunctuation,
          ]
    
          twoQuestions.forEach((q) => {
            const split = splitRawCommands(q)
    
            expect(split.length).toBe(2)
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: true, raw: baseCommandOne }),
            )
            expect(split[1]).toEqual(
              expect.objectContaining({ dryRun: true, raw: baseCommandTwo }),
            )
          })
    
          threeQuestions.forEach((q) => {
            const split = splitRawCommands(q)
    
            expect(split.length).toBe(3)
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: true, raw: baseCommandOne }),
            )
            expect(split[1]).toEqual(
              expect.objectContaining({ dryRun: true, raw: baseCommandTwo }),
            )
            expect(split[2]).toEqual(
              expect.objectContaining({ dryRun: true, raw: baseCommandThree }),
            )
          })
        })
      })

      describe('imperative', () => {
        const punctuation = ['.', ';', '!']
    
        const compoundDelimiters = (() => {
          // generate delimiters including cases where there are multiple spaces between delimiter and 'then'
          return punctuation
            .concat(
              [...punctuation].flatMap((punc) =>
                [1, 2, 3].map((spaces) => `${punc}${' '.repeat(spaces)}then`),
              ),
            )
            .concat([0, 1, 2, 3].map((spaces) => `,${' '.repeat(spaces)}then`))
            .concat([1, 2, 3].map((spaces) => `, and${' '.repeat(spaces)}then`))
            .concat([1, 2, 3].map((spaces) => `, &${' '.repeat(spaces)}then`))
        })()

        it('single commands', () => {
          const statements = punctuation.map(punc => `${baseCommandOne}${punc}`)
    
          statements.forEach((statement) => {
            const split = splitRawCommands(statement)
            expect(split.length).toBe(1)
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: false, raw: 'take the sword' }),
            )
          })
        })
    
        it('compound commands', () => {
          const doubleCommands = compoundDelimiters.map(
            delimiter => [baseCommandOne, baseCommandTwo].join(delimiter)
          )

          const tripleCommandsWithoutPunctuation = compoundDelimiters.flatMap(
            delimiter => doubleCommands.flatMap(doubleCommand => [doubleCommand, baseCommandThree].join(delimiter))
          )

          const tripleCommandsWithPunctuation = punctuation.flatMap(
            punc => tripleCommandsWithoutPunctuation.map(commands => `${commands}${punc}`)
          )

          const tripleCommands = [
            ...tripleCommandsWithoutPunctuation,
            ...tripleCommandsWithPunctuation,
          ]

          doubleCommands.forEach((commands) => {
            const split = splitRawCommands(commands)
    
            expect(split.length).toBe(2)
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandOne }),
            )
            expect(split[1]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandTwo }),
            )
          })
    
          tripleCommands.forEach((commands) => {
            const split = splitRawCommands(commands)
    
            expect(split.length).toBe(3)
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandOne }),
            )
            expect(split[1]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandTwo }),
            )
            expect(split[2]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandThree }),
            )
          })
        })
      })
    })
  })
})
