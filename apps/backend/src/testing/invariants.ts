import postgres from 'postgres'

const outsideTheProject = (table: string) => `
    select r.task_id, r.user_id from ${table} r
    join tasks t on t.id = r.task_id
    join boards b on b.id = t.board_id
    where not exists (
      select 1 from project_members m
      where m.project_id = b.project_id and m.user_id = r.user_id
    )`

// Lifecycle rules the whole suite leaves intact. Each query lists the rows
// that break its rule.
const invariants: Record<string, string> = {
  'a follower outlives their access to the task':
    outsideTheProject('task_followers'),
  'a notification outlives its access to the task':
    outsideTheProject('notifications'),
  'an assignee is outside the project of the task':
    outsideTheProject('task_assignees'),
  'a template assignee is outside the project of the template': `
    select a.template_id, a.user_id from task_template_assignees a
    join task_templates t on t.id = a.template_id
    where not exists (
      select 1 from project_members m
      where m.project_id = t.project_id and m.user_id = a.user_id
    )`,
  'a template label is of another project': `
    select l.template_id, l.label_id from task_template_labels l
    join task_templates t on t.id = l.template_id
    join labels on labels.id = l.label_id
    where labels.project_id is distinct from t.project_id`,
  'a task is linked to a template of another project': `
    select t.id, t.template_id from tasks t
    join boards b on b.id = t.board_id
    join task_templates tt on tt.id = t.template_id
    where tt.project_id <> b.project_id`,
  'a job about a task would outlive it': `
    select id, kind, task_id, payload from jobs
    where (kind = 'notification_email' and task_id is null)
      or (payload ? 'taskId'
        and task_id::text is distinct from payload->>'taskId')`,
  'a job about a person would outlive them': `
    select id, kind, user_id, payload from jobs
    where kind in ('reminder', 'notification_email', 'notification_digest')
      and user_id::text is distinct from payload->>'userId'`,
  'a reminder job outlives its reminder': `
    select id, key from jobs
    where kind = 'reminder' and not exists (
      select 1 from task_reminders r where jobs.key = 'reminder:' || r.id
    )`,
  'a reminder outlives its access to the task':
    outsideTheProject('task_reminders'),
  'a trashed task is never purged': `
    select t.id from tasks t
    left join tasks parent on parent.id = t.parent_id
    where t.deleted_at is not null and parent.deleted_at is null
      and not exists (
        select 1 from jobs where jobs.task_id = t.id and jobs.kind = 'purge-task'
      )`,
  'a task out of the trash is still to be purged': `
    select jobs.id, jobs.task_id from jobs join tasks t on t.id = jobs.task_id
    where jobs.kind = 'purge-task' and t.deleted_at is null`
}

/** Takes a superuser URL, so row level security hides no broken rows. */
export async function checkInvariants(url: string): Promise<void> {
  const sql = postgres(url, { max: 1, onnotice: () => undefined })
  try {
    const results = await Promise.all(
      Object.entries(invariants).map(async ([rule, query]) => ({
        rule,
        rows: await sql.unsafe(`select * from (${query}) broken limit 20`)
      }))
    )
    const broken = results
      .filter(({ rows }) => rows.length > 0)
      .map(({ rule, rows }) => `${rule}:\n${JSON.stringify(rows)}`)
    if (broken.length > 0) {
      throw new Error(`Orphan invariants broken:\n${broken.join('\n')}`)
    }
  } finally {
    await sql.end()
  }
}
