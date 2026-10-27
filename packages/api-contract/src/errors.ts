import { z } from 'zod'

export const REFUSALS = z.enum([
  'not_found',
  'forbidden',
  'archived',
  'invalid_section',
  'stale_neighbours',
  'section_not_empty',
  'invalid_assignee',
  'stale_version',
  'invalid_parent',
  'too_deep',
  'invalid_label',
  'invalid_dates',
  'invalid_reminder',
  'too_many_mentions',
  'too_many_reminders',
  'label_taken',
  'section_name_taken',
  'last_admin',
  'key_prefix_taken',
  'same_board',
  'invalid_request',
  'unavailable',
  'server_error'
])
