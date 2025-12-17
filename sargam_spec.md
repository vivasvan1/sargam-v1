# Indian Music Notebook Format and `sargam‑v1` Grammar

This document defines a minimal formal specification for the _Indian Music Notebook_ (`.imnb`) container format and the `sargam‑v1` domain‑specific language used to encode Indian classical music.  The goal is to provide a clear, unambiguous grammar that can be used by programmers to parse and generate music cells, while still being friendly to human authors.

##  Indian Music Notebook (`.imnb`)

An Indian Music Notebook is a JSON object that contains metadata and an array of cells.  It is intentionally similar to the Jupyter notebook format so that conversion between the two can be straightforward.  The top‑level keys are:

```json
{
  "imnb_version": 1,
  "metadata": { /* arbitrary key–value pairs */ },
  "cells": [ /* ordered list of cells */ ]
}
```

Each entry in `cells` is one of the following:

| Field         | Description                                                        |
|---------------|--------------------------------------------------------------------|
| `cell_type`   | Either `"markdown"` or `"music"`.                                  |
| `metadata`    | A free‑form object for cell‑specific metadata (e.g. playback info).|
| `source`      | An array of strings containing the cell contents, joined by newlines.|

The `metadata` of a music cell should include at least a `language` key indicating which DSL version is used (e.g. `"sargam‑v1"`).  Additional playback‑related fields such as `instrument`, `tempo` or `key` may be added as needed.

## `@` Directives

Within a music cell, lines beginning with `@` are _directives_.  They set context for all subsequent voices and note lines until overridden.  The grammar for directive lines is:

```
DirectiveLine  ::= '@' DirectiveKey (WS DirectiveValue)?
DirectiveKey   ::= 'language' | 'system' | 'raga' | 'thaat'
                | 'melakarta' | 'tala' | 'laya' | 'tempo'
                | 'sa_pitch' | 'default_duration' | 'swing'
                | 'annot' | 'key'
DirectiveValue ::= any characters until end‑of‑line
WS             ::= one or more spaces or tabs
```

These keys are extensible.  Unknown keys should be preserved as annotations.  `@sa_pitch` assigns the reference pitch for Sa (e.g. `C4` or `261.63Hz`) and is used to convert swaras to absolute frequency.

## Voice Declarations

Multiple concurrent parts (e.g. melody and tanpura) are handled with voice declarations.  A voice line starts with `#voice` followed by a name:

```
VoiceLine ::= '#voice' WS VoiceName
VoiceName ::= any non‑blank characters until end‑of‑line
```

All subsequent note lines belong to the current voice until a new `#voice` line appears or the cell ends.  If no voice is declared, a default voice named `"default"` is used.

## Note Lines

Note lines contain sequences of _tokens_ separated by whitespace.  Comment text beginning with `#` after the tokens is ignored.  The grammar for note lines is:

```
NoteLine    ::= Token (WS Token)* (WS Comment)?
Comment     ::= '#' any characters until end‑of‑line
```

### Tokens

Each token is one of the following:

1. **Bar markers**
   
   * `"|"` – a vibhag divider within a tala cycle.
   * `"||"` – end of an avartan (complete cycle).

2. **Rest** – `_` optionally followed by a duration specifier (see below).  A rest consumes time without producing a sound.

3. **Hold** – `.` optionally followed by a duration.  It extends the previous note for the specified duration.

4. **Note** – a swara with optional modifiers, duration, ornaments and lyrics.  It has the structure:

```
NoteToken ::= Swara Octave? Variant? Duration? Ornaments? Lyric?

Swara     ::= 'S' | 'R' | 'G' | 'M' | 'P' | 'D' | 'N'
            | 'SA' | 'RI' | 'GA' | 'MA' | 'PA' | 'DHA' | 'NI'

Octave    ::= ("'" | ',')+
              // each `'` raises the pitch by one octave;
              // each `,` lowers the pitch by one octave

Variant   ::= 'k' | 't' | '#' | 'b' | Microtone
              // 'k' komal (flat), 't' tivra (sharp),
              // '#' sharp, 'b' flat;
              // microtonal offsets described below.

Microtone ::= 'n' ('+'|'-') Float ( 'c' | 'st' )
              // e.g. n+25c = +25 cents; n-0.25st = –0.25 semitone

Duration  ::= ':' Float
              // duration in beats (matras).  If omitted, use the current
              // @default_duration (default = 1).

Ornaments ::= '+' Ornament (',' Ornament)*
              // one or more ornaments separated by commas

Ornament  ::= OrnamentName '(' OrnParamList? ')' | OrnamentName

OrnamentName ::= 'meend' | 'kan' | 'andolan' | 'kampita' | 'mordent'
               | 'slide' | 'shake' | ident  // extensible

OrnParamList ::= OrnParam (',' OrnParam)*

OrnParam  ::= quoted string | NoteToken | Float | ident

Lyric     ::= '=' '"' any characters not containing '"' '"'

Float     ::= digits [ '.' digits ]
digits    ::= [0‑9]+
ident     ::= [A‑Za‑z_][A‑Za‑z_0‑9]*
WS        ::= space or tab
```

### Examples

* `S` – shuddha Sa, default octave, default duration.
* `Rk` – komal Re (flat).  The article on Indian swaras notes that Re, Ga, Dha and Ni can be shuddha or komal, while Ma can be shuddha or tivra【655250085019640†L120-L130】.
* `M#'` – tivra Ma in the upper octave.
* `G:2` – Gandhar lasting two beats.
* `Dk,:0.5` – komal Dha in the lower octave (one comma) lasting half a beat.
* `S+meend(P)` – Sa with a meend ornament sliding to Pa.
* `G="mo"` – Ga associated with the lyric syllable “mo”.
* `_0.5` – rest lasting half a beat.
* `|` and `||` – bar and cycle markers.

## Microtonal notation

Indian classical music uses microtones (shruti).  To represent microtonal deviations, `Microtone` tokens allow cent or semitone offsets relative to the swara.  For example, `n+25c` means +25 cents and `n-0.25st` means –0.25 semitone.  A microtonal modifier always begins with `n` followed by a signed number and a unit suffix (`c` for cents, `st` for semitone).

## Ornamentation

Ornaments capture expressive techniques such as slides, shakes and oscillations.  They follow a `+` and can accept parameters in parentheses.  The list of supported ornament names is open‑ended.  Common ornaments include:

| Name   | Description |
|--------|-------------|
| `meend(to)` | A slide from the current swara to the target swara. |
| `kan(from)`| A grace note (acciaccatura) starting from `from` into the current swara. |
| `andolan(amount)` | A slow oscillation around the swara. |
| `kampita(speed)` | A fast oscillation. |
| `shake` | A repeated rapid alternation (approx. vibrato). |
| `slide(to)` | Alias for `meend`. |

Further ornaments may be added by language versions.

## Reserved characters

Within a note line, the following characters have special meaning and must be escaped if literal text is required in lyrics or annotation: `@`, `#`, `|`, `||`, `_`, `.`, `+`, `'`, `,`, `:` and `=`.  Quoted lyric strings may contain any character except an unescaped double quote.

## Relationship to traditional notation

The Hindustani sargam notation names seven primary swaras (Sa, Re, Ga, Ma, Pa, Dha and Ni)【655250085019640†L120-L130】.  These may be altered by variants—komal (flat) or tivra (sharp)—and transposed into higher or lower octaves using dots or apostrophes【655250085019640†L120-L130】.  The `sargam‑v1` grammar generalizes these conventions and makes them machine‑parseable.  For example, a dot below a letter in traditional notation corresponds to a comma in the `Octave` field, and an acute accent (tivar) becomes a `'t'` or `#` modifier【655250085019640†L120-L130】.  Carnatic notation often uses suffix numbers for variants (e.g. `R1`, `R2`); the grammar allows both Hindustani and Carnatic style names by including multi‑character swaras.

## Extensibility

Future DSL versions may introduce additional directives, ornament names, or notation features.  Parsers should ignore unknown directives and ornaments but preserve them when re‑serializing.
