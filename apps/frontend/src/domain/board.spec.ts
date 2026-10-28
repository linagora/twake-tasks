import { describe, expect, it } from 'vitest'

import {
  isArchivable,
  isEditable,
  isManageable,
  isRenamable,
  isShareable,
  labelName,
  takesBoards,
  whyNotShareable,
  type BoardSummary,
  type Role
} from './board'

type Rules = Pick<BoardSummary, 'role' | 'archived' | 'inbox' | 'project'>

function board(role: Role, overrides: Partial<Rules> = {}): Rules {
  return {
    role,
    archived: false,
    inbox: false,
    project: {
      id: 'p-marketing',
      name: 'Marketing',
      personal: false,
      managed: false
    },
    ...overrides
  }
}

const personal = {
  id: 'p-me',
  name: 'Personal',
  personal: true,
  managed: false
}
const space = { id: 'p-space', name: 'Design', personal: false, managed: true }

const rules = (each: Rules) => ({
  editable: isEditable(each),
  manageable: isManageable(each),
  renamable: isRenamable(each),
  archivable: isArchivable(each),
  shareable: isShareable(each)
})

describe('board permissions', () => {
  it('lets a viewer only read', () => {
    expect(rules(board('viewer'))).toEqual({
      editable: false,
      manageable: false,
      renamable: false,
      archivable: false,
      shareable: false
    })
  })

  it('lets an editor change the tasks, not the board', () => {
    expect(rules(board('editor'))).toEqual({
      editable: true,
      manageable: false,
      renamable: false,
      archivable: false,
      shareable: false
    })
  })

  it('lets an admin do everything', () => {
    expect(rules(board('admin'))).toEqual({
      editable: true,
      manageable: true,
      renamable: true,
      archivable: true,
      shareable: true
    })
  })

  it('leaves an archived board read only, except to unarchive it', () => {
    expect(rules(board('admin', { archived: true }))).toEqual({
      editable: false,
      manageable: false,
      renamable: false,
      archivable: true,
      shareable: false
    })
    expect(isEditable(board('editor', { archived: true }))).toBe(false)
  })

  it('never renames nor archives the inbox', () => {
    expect(rules(board('admin', { inbox: true, project: personal }))).toEqual({
      editable: true,
      manageable: true,
      renamable: false,
      archivable: false,
      shareable: false
    })
  })
})

describe('whyNotShareable', () => {
  it('gives the first reason a board cannot be shared', () => {
    expect(whyNotShareable(board('admin'))).toBeNull()
    expect(whyNotShareable(board('admin', { project: personal }))).toBe(
      'personal'
    )
    expect(whyNotShareable(board('viewer', { project: space }))).toBe('managed')
    expect(whyNotShareable(board('editor', { archived: true }))).toBe(
      'archived'
    )
    expect(whyNotShareable(board('editor'))).toBe('notAdmin')
  })
})

describe('takesBoards', () => {
  it('takes boards into a shared project the person can edit', () => {
    expect(takesBoards({ role: 'editor', personal: false })).toBe(true)
    expect(takesBoards({ role: 'admin', personal: false })).toBe(true)
    expect(takesBoards({ role: 'viewer', personal: false })).toBe(false)
    expect(takesBoards({ role: 'admin', personal: true })).toBe(false)
  })
})

describe('labelName', () => {
  it.each([
    'x\u{E0067}\u{E0062}',
    '\u{1F3F4}\u{E0067}\u{E0062}\u{A0073}\u{E0063}\u{E0074}\u{E007F}',
    '\u{1D400}\u{200C}\u{0628}',
    'e\u{200B}\u{0301}'
  ])('normalises %j once and for all', name => {
    const stored = labelName(name)

    expect(labelName(stored)).toBe(stored)
  })

  it('keeps the tags of a subdivision flag', () => {
    const flag =
      '\u{1F3F4}\u{E0067}\u{E0062}\u{E0073}\u{E0063}\u{E0074}\u{E007F}'

    expect(labelName(flag)).toBe(flag)
  })
})
