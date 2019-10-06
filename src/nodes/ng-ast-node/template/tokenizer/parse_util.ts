/**
 * @license
 * Copyright Google Inc. All Rights Reserved.
 *
 * Use of this source code is governed by an MIT-style license that can be
 * found in the LICENSE file at https://angular.io/license
 */

import { LocationSpan } from '../../location'

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

