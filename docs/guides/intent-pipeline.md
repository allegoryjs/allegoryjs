# Intent Pipeline

## Introduction

The **intent pipeline** is a major component of the Allegory engine. It is responsible for taking structured command objects (which are extracted from the player's input text) and executing game logic based on those commands. For many games, the abstractions provided by [World Kits](./world-kits.md) will be enough to create a full game, and the developers of those games won't need to know about the intent pipeline at all. However, for devs who want to have complete control and freedom, the topics in this document will be essential.

## Intents
An **intent** is a structured container representing something someone wants to do or know. Intents are extracted from player **commands**, which are the raw strings entered by the player, e.g. `'Eat the apple'` or `'Can I break that door down with my sword?'`. Commands are processed during [intent classification](./intent-classification.md) into an array of one or more intent objects which represent what the player wants to do in terms of things the game knows how to handle. Intents can also come from game actors, like NPCs or objects in the environment. Let's take a look at the interface:

```ts
interface Intent {
    name: string
    actor?: Entity
    target?: Entity
    auxiliary?: Array<Entity>
}
```

The only thing an intent definitely has is a **name**. Intent names are constants that map onto specific actions. For example, an intent name might be `SAVE`, `ATTACK`, or `INVENTORY`, which could map onto saving the game, attacking something/someone, and inspecting the player's inventory, respectively. The other three fields of the `Intent` interface are references to [entities](./ecs.md#entities) which pertain to the intent: who/what is performing the action (`actor`), who/what is being acted upon (`target`), and what implements or tools the actor is using to achieve their goal (`auxiliary`). Now, this isn't quite enough data for the game engine to decide what to do. This is why intents come wrapped in an `IntentClassificationResponse` object, which looks like:

```ts
interface IntentClassificationResponse {
    intent?: Intent
    confidence: number
    dryRun: boolean
}
```

With this extra information, the game engine has all it needs to proceed with making something actually happen. The `confidence` score, which is normalized to be between 0 and 1 (inclusive), comes from the [NLP module](./intent-classification.md#nlp), and it represents the likelihood that the intent produced by the classification process actually matches the intent produced. The confidence threshold defaults to `0.7`, and is configurable via the `config` argument of the `IntentPipeline` class. If the NLP module determines that a player's command is vague, ambiguous, or abstract, it will have a low confidence score, and the command will be considered invalid. The `dryRun` flag indicates whether the player actually wants to do the action represented by the intent object, or if they are just asking if it is possible.


## Laws
At the core of the intent pipeline is the concept of **Laws**. A Law is a pluggable encapsulation of a game system—things like combat, inventory, perception, and NPC dialogues are all made possible through Laws. A Law is essentially a container for an intent handler with some metadata that describe when and why it should be invoked. Here's what a Law looks like:

```ts
interface Law<ComponentSchema extends EngineComponentSchema> {
    layer: LawLayer
    name: string
    intents: Array<string>
    apply: (ctx: LawContext) => Promise<Contribution<ComponentSchema>>
    matchers: Array<LawMatcher<ComponentSchema>>
}
```

Let's say we want to have a simple combat system. It could be implemented by `ratify`ing (i.e. registering within the intent pipeline) a Law called `CombatLaw`. `CombatLaw` states that it only knows how to handle intents with the name `'ATTACK'`. If the player says "eat the red apple", and the intent classification module outputs an intent like `name="EAT", actor={player ID}, target={apple instance ID}`, the intent pipeline looks for Laws that know how to handle `'EAT'`; `CombatLaw` does not know how to handle that, so it is skipped over and not invoked. However, if the player says "attack the goblin on the left", and the intent classification looks like `name="ATTACK", actor={player ID}, target={goblin ID}`, `CombatLaw` raises its hand and says, "pick me! I know how to handle `ATTACK`s!" In that case, the `apply` function of the Law is called, and the logic related to processing an attack runs.

Simple enough, right? But what if there are two Laws that raise their hands? Maybe there is a Law called `SpiderSilkLaw`, which handles logic related to impeding the player's movements when they are wrapped up in the silk of a giant spider they are facing. When it's in effect, `SpiderSilkLaw` needs to be able to say, "hold on there, you need to make a strength roll to see if you can attack". How can we determine that `SpiderSilkLaw` needs to run before `CombatLaw`? Well, our first line of defense is the `layer` property. eztodo resume here







While all intents are valid structurally, they may not always be valid logically.
