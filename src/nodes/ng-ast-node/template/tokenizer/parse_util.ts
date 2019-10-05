/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { LocationSpan } from '../../location'

/**
 * @deprecated Use {@link LocationPointer} instead.
 */
export class ParseLocation {
  constructor (
    public file: ParseSourceFile,
    public offset: number,
    public line: number,
    public col: number,
  ) {
  }

  toString (): string {
    return this.offset != null ? `${this.file.url}@${this.line}:${this.col}` : this.file.url
  }

  // Return the source around the location
  // Up to `maxChars` or `maxLines` on each side of the location
  getContext (maxChars: number, maxLines: number): { before: string, after: string } | null {
    const content = this.file.content
    let startOffset = this.offset

    if (startOffset != null) {
      if (startOffset > content.length - 1) {
        startOffset = content.length - 1
      }
      let endOffset = startOffset
      let ctxChars = 0
      let ctxLines = 0

      while (ctxChars < maxChars && startOffset > 0) {
        startOffset--
        ctxChars++
        if (content[startOffset] == '\n') {
          if (++ctxLines == maxLines) {
            break
          }
        }
      }

      ctxChars = 0
      ctxLines = 0
      while (ctxChars < maxChars && endOffset < content.length - 1) {
        endOffset++
        ctxChars++
        if (content[endOffset] == '\n') {
          if (++ctxLines == maxLines) {
            break
          }
        }
      }

      return {
        before: content.substring(startOffset, this.offset),
        after: content.substring(this.offset, endOffset + 1),
      }
    }

    return null
  }
}

/**
 * @deprecated Use {@link LocationFile} instead.
 */
export class ParseSourceFile {
  constructor (public content: string, public url: string) {
  }
}

/**
 * @deprecated Use {@link LocationSpan} instead.
 */
export class ParseSourceSpan {
  constructor (
    public start: ParseLocation,
    public end: ParseLocation,
    public details: string | null = null,
  ) {
  }

  toString (): string {
    return this.start.file.content.substring(this.start.offset, this.end.offset)
  }
}

export enum ParseErrorLevel {
  WARNING,
  ERROR,
}


export class ParseError {
  constructor (
    public span: LocationSpan,
    public msg: string,
    public level: ParseErrorLevel = ParseErrorLevel.ERROR,
  ) {
  }

  contextualMessage (): string {
    const ctx = this.span.getStart().getContext(100, 3)
    return ctx ? `${this.msg} ("${ctx.before}[${ParseErrorLevel[this.level]} ->]${ctx.after}")` :
      this.msg
  }

  toString (): string {
    const message = this.contextualMessage()
    const start = this.span.getStart()
    return `${message}: ${start}`
  }
}

