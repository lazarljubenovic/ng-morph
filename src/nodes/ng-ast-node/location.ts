import * as tsm from 'ts-morph'
import { SimpleCache } from '../../utils/manager'
import * as path from 'path'
import * as fs from 'fs'

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
      const content = fs.readFileSync(uri, { encoding: 'utf8' })
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

}

export interface PointerVariations {
  oneBased: boolean
}

export const DEFAULT_POINTER_VARIATIONS: PointerVariations = {
  oneBased: false
}

export class LocationPointer {

  private zeroBasedOffset: number
  private zeroBasedLine?: number
  private zeoBasedCol?: number

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

  public setOffset (offset: number): this {
    this.zeroBasedOffset = offset
    this.invalidateLineAndCol()
    return this
  }

  public moveBy (delta: number): this {
    const offset = this.getOffset() + delta
    return this.setOffset(offset)
  }

  public clone (): LocationPointer {
    return new LocationPointer(this.locationFile, this.zeroBasedOffset)
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
      const min = locationSpan[minStartIndex].getStart().getOffset()
      const max = locationSpan[maxEndIndex].getEnd().getOffset()
      const start = span.getStart().getOffset()
      const end = span.getEnd().getOffset()
      if (start < min) minStartIndex = index
      if (end > max) maxEndIndex = index
    }
    const start = locationSpan[minStartIndex].getStart().getOffset()
    const end = locationSpan[maxEndIndex].getEnd().getOffset()
    return LocationSpan.FromFile(referenceFile, start, end)
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

  public setStart (newStart: LocationPointer): this {
    this.start = newStart
    return this
  }

  public setEnd (newEnd: LocationPointer): this {
    this.end = newEnd
    return this
  }

  public setStartOffset (newStartOffset: number): this {
    this.start.setOffset(newStartOffset)
    return this
  }

  public setEndOffset (newEndOffset: number): this {
    this.end.setOffset(newEndOffset)
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
    const start = this.getStart().getOffset()
    const end = this.getEnd().getOffset()
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
    const start = this.getStart().getOffset()
    this.getFile().replaceText(start, this.getLength(), newText)
    this.changeLengthTo(newText.length)
  }

  public clone (): LocationSpan {
    const start = this.getStart().clone()
    const end = this.getEnd().clone()
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
