import type postgres from 'postgres'
import { listenToChanges, type Changes } from '../../infra/changes.ts'

export const SETTINGS_CHANNEL = 'settings_changes'

export type SettingsChanges = Changes

export const listenToSettings = (
  client: postgres.Sql
): Promise<SettingsChanges> => listenToChanges(client, SETTINGS_CHANNEL)
