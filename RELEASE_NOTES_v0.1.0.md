# Autonym v0.1.0 — Public Beta

Autonym is a desktop app for solo roleplay and collaborative story-writing with AI, built
around structured character sheets, lorebooks, and full control over how context is spent —
instead of one long freeform prompt. This is the first public beta.

**This is a beta.** Core writing, characters, and worldbuilding are solid and daily-driver
ready, but expect rough edges, and please report anything that breaks.

## Meet Nym

New installs now open with a proper in-app introduction instead of dropping you on a blank
screen: **Nym**, Autonym's mascot, greets you with a full demo setup — a cast character, a
sample universe ("The Between") with a linked lorebook entry, a demo scenario, and an already
-started chat that shows off every formatting marker in real use.

## Guided onboarding tour

A step-by-step tour (launchable anytime from Settings → **Take the Tour**) walks through every
part of the app in order — Home, Cast, Universes, Lorebooks, Acts (chat), Improvise, and
Settings — spotlighting the actual UI element it's describing on the page it lives on, narrated
in Nym's voice.

## Personas

Settings now has a full **Personas** section — create, edit, and delete the personas you play as
across your Acts. (The backend already supported this; there was just no way to reach it from
the UI until now.)

## Improvise, reorganized

Scenario Maker is now **Improvise**, and Skit creation — hand a cast member and a length to the
AI and let it write an entire scene unattended — has moved out of the chat sidebar into its own
section here, so you no longer need to already be inside an Act to start one.

## Context-window tooling

- Scene Memory (context length) now caps to the selected model's real maximum instead of
  accepting an arbitrary number, and re-clamps automatically if you switch to a smaller-context
  model.
- A warning now appears as an Act approaches its context limit, with a direct way to continue
  the story in a fresh Act.
- **Compact Older Messages** lets you summarize an Act's earlier turns into a running summary in
  place, instead of only being able to fork to a new Act.

## Fixes and polish

- Fixed a formatting bug where an unclosed `"dialogue"` quote could swallow a `*action*` or
  `~thought~` marker that followed it on the same line, rendering the literal asterisks/tildes
  as bold text instead of parsing them.
- Cast page: reordered the character form to lead with identity, redesigned the avatar picker,
  added collapsible sections and auto-growing text fields.
- Lorebooks can now be scoped to a Universe.
- Wiki/text import for new characters is now a single fetch-and-organize step.
- Universe and Lorebook pages auto-select the first item instead of landing on an empty
  "select one" screen.
- Switched body text to Manrope and fixed several low-contrast UI states.
- Fixed Group Scenes: a speaker-cue leak, shallow cast depth, and no way to manually correct
  who's speaking.

## Links

- Website: [autonym.app](https://autonym.app)
- GitHub: [autonymapp/autonym](https://github.com/autonymapp/autonym)
- Issues / feedback: [github.com/autonymapp/autonym/issues](https://github.com/autonymapp/autonym/issues)
