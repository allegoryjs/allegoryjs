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

Simple enough. But what if there are two Laws that raise their hands? Maybe there is a Law called `SpiderSilkLaw`, which handles logic related to impeding the player's movements when they are wrapped up in the silk of a giant spider they are facing. When it's in effect, `SpiderSilkLaw` needs to be able to say, "hold on there, you need to make a strength roll to see if you can attack". How can we determine that `SpiderSilkLaw` needs to run before `CombatLaw`? This is where Law **specificity** comes in.

### Specificity
The system of Law specificity is inspired by CSS. In CSS, the selector which is the most specific about which element it styles takes precedence. It's the same here. Specificity in the Allegory engine is represented as a tuple of `[layer, matcher]`.

#### Layers
Let's look at the `LawLayer` interface:

```ts
export enum LawLayer {
    /*********************
     *** Engine Layers ***
     *********************/

    Core = 0,
    Kit = 1,

    /***********************
     *** Userland Layers ***
     ***********************/

    Game = 2,
    Instance = 3
}
```

Each layer represents a classification of Law. This helps eliminate conflicts and reduce logical overhead with *specificity*, which we will talk about later. Here's what each layer is for:
- **Core (0)**: built-in Laws, which typically handle basic functions (like saving) or fall-through cases indicating that the engine does not understand a command, and which are easily overwritten. These Laws have very low precedence. Developers won't need to add Laws in this layer unless they are trying to modify fundamental engine behavior.
- **Kit (1)**: Laws introduced by World Kits, providing game-genre-specific functionality, e.g. the adventure game World Kit will provide inventory management, movement/locations, perception, and combat
- **Game (2)**: Laws related to the specific game being built, e.g. "Taking a Cursed Item deals damage." This is where game devs will author any game logic that they want to add on top of functionality provided by World Kits.
- **Instance (3)**: Laws related to a specific entity, attached via [Script](./world-kits.md#scripts), e.g., "Taking the Idol triggers the boulder trap." These Laws have the highest precedence.

Layers alone are not enough to enable the engine to decide what order in which to run Laws. Many Laws will fall into the Game layer. This is where matchers come in.

#### Matchers
Matchers are criteria which determine to what degree an intent is related to a Law. Each Law has an array of matchers, each representing some scenario that the Law cares about. These matchers are scored for each intent, and whatever matcher has the highest score is considered to be the Law's overall score (i.e. matcher scores are not added together).

At the core of matchers is the concept of **concerns**. A concern can be applied to an **actor**, a **target**, or **auxiliary implement(s)**. The Law declares inside of a concern what **components**, **props**, **tags**, and/or **ids** it cares about. For example, perhaps a Law only cares about an intent when the ID of the actor is `player` and the entity with that ID has the component `SanityComponent`. Or maybe a Law cares about any entity with the tag `aflame`. Each type of constraint has a different weight, which defaults to:
- **component** matches: 10 points
- **prop** (i.e. component data value) matches: 20 points
- **tags** matches: 2.5 points
- **ID** matches: 100 points

So, let's say we have a Law called `IgniteLaw`. It declares that it can handle the intents `'LIGHT'`, `'BURN'`, and `'IGNITE'`. To determine if it should be chosen over `ComedyLaw`, which also handles `'BURN'` (as in, a verbal dig), to handle the intent (in the case of an ambiguous/overloaded intent name), it declares the following matchers:


```js
matchers: [
    // Scenario 1: The Mundane Way (Needs a tool)
    {
        actor: { props: [{ prop: 'Equipment.mainHand', value: 'flint' }] },
        target: { tags: ['flammable'] }
    },

    // Scenario 2: The Magic Way (Needs a skill)
    {
        actor: { components: ['FireMagicSkill'] },
        target: { tags: ['flammable'] }
    }
],
```

This way, `IgniteLaw` can express precisely when it applies to the incoming intent. If the actor is an entity with a flint in its main hand and it is targeting something flammable, or if it is a magic user and is casting a fire spell aimed at a flammable target, `IgniteLaw` wants to handle the intent. If the target is an NPC, and the actor is a character, `ComedyLaw` should take over. If the intent does in fact




--- TODO (temp) ---

Talk about COMPLETED, PASS, and REJECTED

While all intents are valid structurally, they may not always be valid logically.
