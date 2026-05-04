import { describe, expect, it } from "bun:test";

import { splitRawCommands } from "@/nlp/language-profile/profiles/profile-en-us";
import chunkArray from "@/utilities/chunkArray/chunkArray";

describe("profile-en-us", () => {
  describe("splits commands correctly", () => {
    it("handles empty or whitespace-only input", () => {
      expect(splitRawCommands("")).toEqual([]);
      expect(splitRawCommands("   ")).toEqual([]);
    });

    it("handles leading and trailing delimiters", () => {
      // Note: currently leading delimiters are kept if not preceded by a word character
      // because the split regex starts with \b
      expect(splitRawCommands(". take sword")).toEqual([
        { dryRun: false, raw: ". take sword" },
      ]);
      expect(splitRawCommands("take sword then")).toEqual([
        { dryRun: false, raw: "take sword" },
      ]);
      expect(splitRawCommands("take sword.")).toEqual([
        { dryRun: false, raw: "take sword" },
      ]);
    });

    it("handles repeated delimiters", () => {
      expect(splitRawCommands("take sword then then attack")).toEqual([
        { dryRun: false, raw: "take sword" },
        { dryRun: false, raw: "attack" },
      ]);
      // '...' without spaces doesn't always split due to \b
      expect(splitRawCommands("take sword ... attack")).toEqual([
        { dryRun: false, raw: "take sword ... attack" },
      ]);
    });

    it("propagates dryRun state correctly across multiple commands", () => {
      expect(
        splitRawCommands("take sword then can i attack then go north"),
      ).toEqual([
        { dryRun: false, raw: "take sword" },
        { dryRun: true, raw: "attack" },
        { dryRun: true, raw: "go north" },
      ]);
    });

    it("is case-insensitive for prefixes and delimiters", () => {
      expect(splitRawCommands("CAN I take sword AND THEN go north")).toEqual([
        { dryRun: true, raw: "take sword" },
        { dryRun: true, raw: "go north" },
      ]);
    });

    it("handles commands that are only an interrogative prefix", () => {
      expect(splitRawCommands("Can I?")).toEqual([{ dryRun: true, raw: "" }]);
    });

    it("preserves spacing within a command but trims outer spacing", () => {
      expect(splitRawCommands("  take   the   sword  ")).toEqual([
        { dryRun: false, raw: "take   the   sword" },
      ]);
    });

    it("handles all supported honorifics and abbreviations without splitting", () => {
      const titles = [
        "Mr.",
        "Mrs.",
        "Ms.",
        "Mx.",
        "Messrs.",
        "Mmes.",
        "Dr.",
        "Prof.",
        "Gen.",
        "Col.",
        "Maj.",
        "Capt.",
        "Lt.",
        "Sgt.",
        "Cpl.",
        "Pvt.",
        "Rev.",
        "Fr.",
        "Sr.",
        "Br.",
        "Rab.",
        "Cant.",
        "Mons.",
        "Hon.",
        "Gov.",
        "Sen.",
        "Rep.",
        "Amb.",
        "Pres.",
        "Jr.",
        "Sr.",
        "No.",
        "Misc.",
      ];

      for (const title of titles) {
        const command = `tell ${title} Green to wait`;
        expect(splitRawCommands(command)).toEqual([
          { dryRun: false, raw: command },
        ]);
      }
    });

    it("handles common contractions with apostrophes without splitting", () => {
      const contractions = [
        `don't`,
        `can't`,
        `won't`,
        `it's`,
        `I'm`,
        `you're`,
        `they're`,
        `we're`,
        `isn't`,
        `wasn't`,
        `couldn't`,
        `shouldn't`,
        `wouldn't`,
      ];

      for (const contraction of contractions) {
        const command = `${contraction} take the sword`;
        expect(splitRawCommands(command)).toEqual([
          { dryRun: false, raw: command },
        ]);
      }
    });

    it("does not split on common abbreviations", () => {
      const cases = [
        {
          input: "tell John Ph.D. Green to wait",
          expected: ["tell John Ph.D. Green to wait"],
        },
        {
          input: "go to Main St. and look",
          expected: ["go to Main St. and look"],
        },
        { input: "it is approx. 5 miles", expected: ["it is approx. 5 miles"] },
        { input: "meet at 123 Ave. B", expected: ["meet at 123 Ave. B"] },
      ];

      for (const { input, expected } of cases) {
        const result = splitRawCommands(input);
        expect(result.map((r) => r.raw)).toEqual(expected);
      }
    });

    it("demonstrates that trailing punctuation alone does not trigger dryRun", () => {
      // Current behavior: dryRun is only triggered by prefixes, not by '?'
      expect(splitRawCommands("attack the goblin?")).toEqual([
        { dryRun: false, raw: "attack the goblin" },
      ]);
    });

    it("does not trigger dryRun if the prefix is not at the very start of the command", () => {
      expect(splitRawCommands("i want to know can i take the sword")).toEqual([
        { dryRun: false, raw: "i want to know can i take the sword" },
      ]);
    });

    it("handles multiple commands with different dryRun statuses correctly", () => {
      // Once dryRun is true, it stays true for the rest of the chain
      expect(
        splitRawCommands("take sword. can i attack? go north. look."),
      ).toEqual([
        { dryRun: false, raw: "take sword" },
        { dryRun: true, raw: "attack" },
        { dryRun: true, raw: "go north" },
        { dryRun: true, raw: "look" },
      ]);
    });

    describe("when the command contains", () => {
      const baseCommandOne = "take the sword";
      const baseCommandTwo = "attack the goblin";
      const baseCommandThree = "heal using the potion";

      describe("interrogative", () => {
        const interrogativePrefixes = [
          "would i be able to",
          "am i able to",
          "could i",
          "can i",
          "is it possible to",
          "may i",
        ];

        const doubleDotPunctuation = ["..", "..!", "..?", "..?!", "..!?"];
        const tripleDotPunctuation = ["...", "...!", "...?", "...?!", "...!?"];

        const punctuation = [
          ".",
          ";",
          "!",
          "?",
          "!?",
          "?!",
          ...doubleDotPunctuation,
          ...tripleDotPunctuation,
        ];

        const compoundDelimiters = (() => {
          // generate delimiters including cases where there are multiple spaces between delimiter and 'then'
          return punctuation
            .concat(
              [...punctuation].flatMap((punc) =>
                [1, 2, 3].map((spaces) => `${punc}${" ".repeat(spaces)}then`),
              ),
            )
            .concat([0, 1, 2].map((spaces) => `,${" ".repeat(spaces)}then`))
            .concat([1, 2].map((spaces) => `, and${" ".repeat(spaces)}then`))
            .concat([1, 2].map((spaces) => `, &${" ".repeat(spaces)}then`));
        })();

        it("single commands", () => {
          let questions = interrogativePrefixes.map(
            (prefix) => `${prefix} ${baseCommandOne}`,
          );

          questions = questions.concat(
            ...questions.map((q) => punctuation.map((punc) => `${q}${punc}`)),
          );

          questions.forEach((q) => {
            const split = splitRawCommands(q);
            expect(split.length).toBe(1);
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: true, raw: "take the sword" }),
            );
          });
        });

        it("two-part compound commands", () => {
          let questions = interrogativePrefixes
            .map((prefix) => `${prefix} ${baseCommandOne}`)
            .flatMap((questionPartOne) =>
              compoundDelimiters.map(
                (delimiter) =>
                  `${questionPartOne}${delimiter} ${baseCommandTwo}`,
              ),
            );

          const twoQuestions = questions.concat(
            ...questions.map((q) => punctuation.map((punc) => `${q}${punc}`)),
          );

          twoQuestions.forEach((q) => {
            const split = splitRawCommands(q);

            expect(split.length).toBe(2);
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: true, raw: baseCommandOne }),
            );
            expect(split[1]).toEqual(
              expect.objectContaining({ dryRun: true, raw: baseCommandTwo }),
            );
          });
        });

        describe("three-part compound commands", () => {
          let questions = interrogativePrefixes
            .map((prefix) => `${prefix} ${baseCommandOne}`)
            .flatMap((questionPartOne) =>
              compoundDelimiters.map(
                (delimiter) =>
                  `${questionPartOne}${delimiter} ${baseCommandTwo}`,
              ),
            );

          const threeQuestionsWithoutPunctuation = questions.flatMap((q) =>
            compoundDelimiters.map(
              (delimiter) => `${q}${delimiter} ${baseCommandThree}`,
            ),
          );

          const threeQuestionsWithPunctuation =
            threeQuestionsWithoutPunctuation.concat(
              threeQuestionsWithoutPunctuation.flatMap((q) =>
                punctuation.map((punc) => `${q}${punc}`),
              ),
            );

          const threeQuestions = [
            ...threeQuestionsWithPunctuation,
            ...threeQuestionsWithoutPunctuation,
          ];

          // there are a huge number of three-questions cases; chunk and test them parallely
          const threeQuestionsChunked = chunkArray(
            threeQuestions,
            Math.floor(threeQuestions.length / 128),
          );

          for (const threeQs of threeQuestionsChunked) {
            it.concurrent("(concurrent)", async () => {
              await Bun.sleep(0);
              for (const q of threeQs) {
                const split = splitRawCommands(q);

                expect(split.length).toBe(3);
                expect(split[0]).toEqual(
                  expect.objectContaining({
                    dryRun: true,
                    raw: baseCommandOne,
                  }),
                );
                expect(split[1]).toEqual(
                  expect.objectContaining({
                    dryRun: true,
                    raw: baseCommandTwo,
                  }),
                );
                expect(split[2]).toEqual(
                  expect.objectContaining({
                    dryRun: true,
                    raw: baseCommandThree,
                  }),
                );
              }
            });
          }
        });
      });

      describe("imperative", () => {
        const doubleDotPunctuation = ["..", "..!"];
        const tripleDotPunctuation = ["...", "...!"];

        const punctuation = [
          ".",
          ";",
          "!",
          ...doubleDotPunctuation,
          ...tripleDotPunctuation,
        ];

        const compoundDelimiters = (() => {
          // generate delimiters including cases where there are multiple spaces between delimiter and 'then'
          return punctuation
            .concat(
              [...punctuation].flatMap((punc) =>
                [1, 2, 3].map((spaces) => `${punc}${" ".repeat(spaces)}then`),
              ),
            )
            .concat([0, 1, 2, 3].map((spaces) => `,${" ".repeat(spaces)}then`))
            .concat([1, 2, 3].map((spaces) => `, and${" ".repeat(spaces)}then`))
            .concat([1, 2, 3].map((spaces) => `, &${" ".repeat(spaces)}then`));
        })();

        it("single commands", () => {
          const statements = punctuation.map(
            (punc) => `${baseCommandOne}${punc}`,
          );

          statements.forEach((statement) => {
            const split = splitRawCommands(statement);
            expect(split.length).toBe(1);
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: false, raw: "take the sword" }),
            );
          });
        });

        it("compound commands", () => {
          const doubleCommands = compoundDelimiters.map((delimiter) =>
            [baseCommandOne, baseCommandTwo].join(delimiter),
          );

          const tripleCommandsWithoutPunctuation = compoundDelimiters.flatMap(
            (delimiter) =>
              doubleCommands.flatMap((doubleCommand) =>
                [doubleCommand, baseCommandThree].join(delimiter),
              ),
          );

          const tripleCommandsWithPunctuation = punctuation.flatMap((punc) =>
            tripleCommandsWithoutPunctuation.map(
              (commands) => `${commands}${punc}`,
            ),
          );

          const tripleCommands = [
            ...tripleCommandsWithoutPunctuation,
            ...tripleCommandsWithPunctuation,
          ];

          doubleCommands.forEach((commands) => {
            const split = splitRawCommands(commands);

            expect(split.length).toBe(2);
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandOne }),
            );
            expect(split[1]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandTwo }),
            );
          });

          tripleCommands.forEach((commands) => {
            const split = splitRawCommands(commands);

            expect(split.length).toBe(3);
            expect(split[0]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandOne }),
            );
            expect(split[1]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandTwo }),
            );
            expect(split[2]).toEqual(
              expect.objectContaining({ dryRun: false, raw: baseCommandThree }),
            );
          });
        });
      });
    });
  });
});
