import * as tsm from 'ts-morph'
import { SimpleCache } from '../../utils/manager'
import * as path from 'path'
import * as fs from 'fs'
import { concatErrors, getFirstElementOrThrow, getLastElementOrThrow } from '../../utils'

function isNewLine (char: string) {
  if (char.length !== 1) {
    throw new Error(`Expected "${char}" to have length 1.`)
  }
  return char == '\n'
}

export class LocationFileManager extends SimpleCache<tsm.SourceFile | string, LocationFile> {
  protected create (sourceFileOrAbsolutePath: tsm.SourceFile | string): LocationFile {
    if (typeof sourceFileOrAbsolutePath == 'string') {
      if (!path.isAbsolute(sourceFileOrAbsolutePath)) {
        throw new Error(`Path must be absolute. Got: "${sourceFileOrAbsolutePath}".`)
      }
      const uri = sourceFileOrAbsolutePath
      const content = fs.readFileSync(uri, {encoding: 'utf8'})
      return new LocationFile(uri, content)
    } else {
      const uri = sourceFileOrAbsolutePath.getFilePath()
      const content = sourceFileOrAbsolutePath.getFullText()
      return new LocationFile(uri, content)
    }
  }
}

/**
 * Represents a file with source code.
 */
export class LocationFile {

  private _isDirty: boolean = false

  public static FromTsm (tsmSourceFile: tsm.SourceFile): LocationFile {
    const uri = tsmSourceFile.getFilePath()
    const content = tsmSourceFile.getFullText()
    return new LocationFile(uri, content)
  }

  public constructor (
    private uri: string,
    private content: string,
  ) {
  }

  public getUri (): string {
    return this.uri
  }

  public getContent (): string {
    return this.content
  }

  public getLength (): number {
    return this.getContent().length
  }

  public isDirty (): boolean {
    return this._isDirty
  }

  public replaceText (offsetIndex: number, deleteCount: number, newText: string): void {
    const left = this.content.slice(0, offsetIndex)
    const right = this.content.slice(offsetIndex + deleteCount)
    this.content = left.concat(newText, right)
    this._isDirty = true
  }

  public insertText (offsetIndex: number, newText: string): void {
    this.replaceText(offsetIndex, 0, newText)
  }

  public deleteText (offsetIndex: number, deleteCount: number): void {
    this.replaceText(offsetIndex, deleteCount, '')
  }

  public saveToDisk () {
    fs.writeFileSync(this.getUri(), this.getContent(), {encoding: 'utf8'})
  }

}

export interface PointerVariations {
  oneBased: boolean
}

export const DEFAULT_POINTER_VARIATIONS: PointerVariations = {
  oneBased: false,
}

type EventListenerOffset = (offset: number) => void

interface SetLocationPointerOffsetOptions {
  allowEvenIfFrozen: boolean
  doNotEmitEvent: boolean
}

export class LocationPointer {

  private zeroBasedOffset: number
  private zeroBasedLine?: number
  private zeoBasedCol?: number

  private _isFrozen: boolean = false
  private frozenMessage?: string

  public constructor (
    private locationFile: LocationFile,
    offset: number,
  ) {
    this.zeroBasedOffset = offset
  }

  public getFile (): LocationFile {
    return this.locationFile
  }

  public getOffset (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): number {
    return this.zeroBasedOffset + (vars.oneBased ? 1 : 0)
  }

  public getLine (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): number {
    if (this.zeroBasedLine == null) {
      this.computeLineAndCol()
    }
    return this.zeroBasedLine! + (vars.oneBased ? 1 : 0)
  }

  public getCol (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): number {
    if (this.zeroBasedLine == null) {
      this.computeLineAndCol()
    }
    return this.zeoBasedCol! + (vars.oneBased ? 1 : 0)
  }

  public setOffset (offset: number, options: Partial<SetLocationPointerOffsetOptions> = {}): this {
    const {
      doNotEmitEvent = false,
      allowEvenIfFrozen = false,
    } = options
    if (!allowEvenIfFrozen) this.assertNotFrozen(`Cannot set offset.`)
    this.zeroBasedOffset = offset
    this.invalidateLineAndCol()
    if (!doNotEmitEvent) this.eventListeners.forEach(listener => listener(this.zeroBasedOffset))
    return this
  }

  private eventListeners: EventListenerOffset[] = []

  /**
   * @todo Check for memory leaks
   */
  public addEventListener (fn: EventListenerOffset): this {
    this.eventListeners.push(fn)
    return this
  }

  public moveBy (delta: number): this {
    const offset = this.getOffset() + delta
    return this.setOffset(offset)
  }

  public clone ({
                  doNotCloneListeners = false,
                } = {}): LocationPointer {
    const clone = new LocationPointer(this.locationFile, this.zeroBasedOffset)
    if (!doNotCloneListeners && this.eventListeners.length > 0) {
      this.eventListeners.forEach(listener => {
        clone.addEventListener(listener)
      })
    }
    return clone
  }

  public printShort (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): string {
    const line = this.getLine(vars)
    const col = this.getCol(vars)
    return `${line}:${col}`
  }

  public printMedium (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): string {
    const line = this.getLine(vars)
    const col = this.getCol(vars)
    const offset = this.getOffset(vars)
    return `${line}:${col} (${offset})`
  }

  public printLong (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): string {
    const medium = this.printMedium(vars)
    const uri = this.getFile().getUri()
    return `${medium} [${uri}]`
  }

  // from angular code
  public getContext (maxChars: number, maxLines: number): { before: string, after: string } | null {
    const content = this.getFile().getContent()
    let startOffset = this.getOffset()

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
        before: content.substring(startOffset, this.getOffset()),
        after: content.substring(this.getOffset(), endOffset + 1),
      }
    }

    return null
  }

  public isFrozen (): boolean {
    return this._isFrozen
  }

  public freeze (message?: string): this {
    this.assertNotFrozen(`Cannot freeze again.`)
    this._isFrozen = true
    this.frozenMessage = message
    return this
  }

  public assertNotFrozen (errMsg: string = `Cannot perform operation.`): void {
    if (this.isFrozen()) {
      const mainErrorMessage = this.frozenMessage == null
        ? `LocationPointer frozen.`
        : `LocationPointer frozen: "${this.frozenMessage}".`
      const error = concatErrors(mainErrorMessage, errMsg)
      throw new Error(error)
    }
  }

  private computeLineAndCol () {
    const fileContent = this.getFile().getContent()
    const length = fileContent.length
    let currentOffset: number = 0
    let currentLine: number = 0
    let currentCol: number = 0
    for (let index = 0; index <= length; index++) {

      if (currentOffset == this.getOffset()) {
        // Found
        this.zeroBasedLine = currentLine
        this.zeoBasedCol = currentCol
        return
      } else if (index == length) {
        // Not found, but cannot go further (char would be undefined below)
        break
      }

      const char = fileContent[index]

      currentOffset++
      if (isNewLine(char)) {
        currentLine++
        currentCol = 0
      } else {
        currentCol++
      }
    }

    const uri = this.getFile().getUri()
    throw new Error(`Programming error. Reached the end of file ${uri} (of length ${length}) without reaching offset ${this.getOffset()}.`)
  }

  private invalidateLineAndCol () {
    this.zeroBasedLine = undefined
    this.zeoBasedCol = undefined
  }

}

export class LocationSpan {

  public static FromFile (file: LocationFile, startOffset: number, endOffset: number): LocationSpan {
    const start = new LocationPointer(file, startOffset)
    const end = new LocationPointer(file, endOffset)
    return new LocationSpan(start, end)
  }

  public static FromFullFile (file: LocationFile): LocationSpan {
    return LocationSpan.FromFile(file, 0, file.getLength())
  }

  public static FromTsm (tsmNode: tsm.Node): LocationSpan {
    const startOffset = tsmNode.getStart()
    const endOffset = tsmNode.getEnd()
    const locationFile = LocationFile.FromTsm(tsmNode.getSourceFile())
    return LocationSpan.FromFile(locationFile, startOffset, endOffset)
  }

  public static FromSeveral (...locationSpan: LocationSpan[]): LocationSpan {
    if (locationSpan.length == 0) {
      throw new Error(`At least one LocationSpan must be given.`)
    }
    let minStartIndex: number = 0
    let maxEndIndex: number = 0
    const referenceFile = locationSpan[0].getFile()
    for (let index = 0; index < locationSpan.length; index++) {
      const span = locationSpan[index]
      const file = span.getFile()
      if (file != referenceFile) {
        throw new Error(`Cannot create a LocationSpan from several LocationSpans across different files (${referenceFile.getUri()}, ${file.getUri()}).`)
      }
      const min = locationSpan[minStartIndex].getStartOffset()
      const max = locationSpan[maxEndIndex].getEndOffset()
      const start = span.getStartOffset()
      const end = span.getEndOffset()
      if (start < min) minStartIndex = index
      if (end > max) maxEndIndex = index
    }
    const start = locationSpan[minStartIndex].getStartOffset()
    const end = locationSpan[maxEndIndex].getEndOffset()
    return LocationSpan.FromFile(referenceFile, start, end)
  }

  public static ReactiveFromSeveralOrdered (...locationSpans: LocationSpan[]): LocationSpan {
    const first = getFirstElementOrThrow(locationSpans)
    const last = getLastElementOrThrow(locationSpans)
    const file = first.getFile()
    const result = LocationSpan.FromFullFile(file)

    result.setStartOffset(first.getStartOffset())
    result.setEndOffset(last.getEndOffset())

    first.getStart().addEventListener(offset => result.setStartOffset(offset, {allowEvenIfFrozen: true}))
    last.getEnd().addEventListener(offset => result.setEndOffset(offset, {allowEvenIfFrozen: true}))

    const errorMessage = `This LocationPointer is reactive, and will be updated when the underlying tokens change.`
    result.getStart().freeze(errorMessage)
    result.getEnd().freeze(errorMessage)

    return result
  }

  public constructor (
    private start: LocationPointer,
    private end: LocationPointer,
  ) {
  }

  public getStart (): LocationPointer {
    return this.start
  }

  public getEnd (): LocationPointer {
    return this.end
  }

  public getStartOffset (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): number {
    return this.getStart().getOffset(vars)
  }

  public getEndOffset (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): number {
    return this.getEnd().getOffset(vars)
  }

  public setStart (newStart: LocationPointer): this {
    this.start = newStart
    return this
  }

  public setEnd (newEnd: LocationPointer): this {
    this.end = newEnd
    return this
  }

  public setStartOffset (newStartOffset: number, options: Partial<SetLocationPointerOffsetOptions> = {}): this {
    this.start.setOffset(newStartOffset, options)
    return this
  }

  public setEndOffset (newEndOffset: number, options: Partial<SetLocationPointerOffsetOptions> = {}): this {
    this.end.setOffset(newEndOffset, options)
    return this
  }

  public getFile (): LocationFile {
    const startFile = this.getStart().getFile()
    const endFile = this.getEnd().getFile()
    if (startFile != endFile) {
      throw new Error(`Expected start and end pointers in LocationSpan to have the same file (${startFile.getUri()}, ${endFile.getUri()}).`)
    }
    return startFile
  }

  public getFileContent (): string {
    return this.getFile().getContent()
  }

  public getText (): string {
    const file = this.getFileContent()
    const start = this.getStartOffset()
    const end = this.getEndOffset()
    return file.slice(start, end)
  }

  public getLength (): number {
    return this.end.getOffset() - this.start.getOffset()
  }

  public moveStartBy (delta: number): this {
    this.start.moveBy(delta)
    return this
  }

  public moveEndBy (delta: number): this {
    this.end.moveBy(delta)
    return this
  }

  public moveBy (delta: number): this {
    return this.moveStartBy(delta).moveEndBy(delta)
  }

  public changeLengthBy (delta: number): this {
    this.end.moveBy(delta)
    return this
  }

  public changeLengthTo (newLength: number): this {
    const oldLength = this.getLength()
    const delta = newLength - oldLength
    return this.changeLengthBy(delta)
  }

  public replaceText (newText: string): void {
    const start = this.getStartOffset()
    this.getFile().replaceText(start, this.getLength(), newText)
    this.changeLengthTo(newText.length)
  }

  public clone ({
                  doNotCloneListeners = false,
                } = {}): LocationSpan {
    const start = this.getStart().clone({doNotCloneListeners})
    const end = this.getEnd().clone({doNotCloneListeners})
    return new LocationSpan(start, end)
  }


  public toString (): string {
    return this.getText()
  }

  public printShort (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): string {
    return this.getStart().printShort(vars)
  }

  public printMedium (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): string {
    const start = this.getStart().printMedium(vars)
    const end = this.getEnd().printMedium(vars)
    return `${start} -> ${end}`
  }

  public printLong (vars: PointerVariations = DEFAULT_POINTER_VARIATIONS): string {
    const medium = this.printMedium(vars)
    const uri = this.getFile().getUri()
    return `${medium} [${uri}]`
  }

}
