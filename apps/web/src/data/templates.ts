import type { PropertyType, FolioDatabase } from '../database-types';
import { newDbId } from '../database-types';

/** ISO date (YYYY-MM-DD) n days from today — keeps template due dates sensible. */
function isoDaysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function todayLong(): string {
  return new Date().toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/* ------------------------------------------------------------------ */
/* Page templates                                                      */
/* ------------------------------------------------------------------ */

/** A ready-made starting point for a page. `initialHtml` is written into the
 * new page's Yjs document on creation (same mechanism as seed content). */
export interface PageTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  initialHtml: string;
}

const taskItem = (text: string, checked = false): string =>
  `<li data-type="taskItem" data-checked="${checked ? 'true' : 'false'}"><p>${text}</p></li>`;

const taskList = (items: string[]): string =>
  `<ul data-type="taskList">${items.join('')}</ul>`;

export const pageTemplates: PageTemplate[] = [
  {
    id: 'meeting-notes',
    name: 'Meeting notes',
    icon: '📝',
    description: 'Attendees, agenda, discussion notes, and action items.',
    initialHtml: `
      <h2>Meeting notes — ${todayLong()}</h2>
      <h3>Attendees</h3>
      <ul>
        <li>Ada Lovelace (Engineering)</li>
        <li>Grace Hopper (Product)</li>
        <li>Alan Turing (Design)</li>
      </ul>
      <h3>Agenda</h3>
      <ol>
        <li>Review last week's action items</li>
        <li>Decide the launch date for the new dashboard</li>
        <li>Agree on who owns the onboarding email sequence</li>
      </ol>
      <h3>Notes</h3>
      <blockquote><p>The dashboard is functionally complete; remaining work is polish on empty states and error copy.</p></blockquote>
      <p>Team agreed to ship behind a feature flag on Friday, then roll out to all users after the Monday metrics check. Grace raised that the onboarding emails still reference the old pricing page — Alan will update the screenshots before Thursday.</p>
      <h3>Action items</h3>
      ${taskList([
        taskItem('Ada: put the dashboard behind the feature flag', true),
        taskItem('Grace: confirm Monday metrics check on the calendar'),
        taskItem('Alan: update onboarding email screenshots'),
        taskItem('All: review the launch checklist before Friday'),
      ])}
    `,
  },
  {
    id: 'project-plan',
    name: 'Project plan',
    icon: '🚀',
    description: 'Goals, milestones, risks, and the team behind a project.',
    initialHtml: `
      <h2>Project plan</h2>
      <blockquote><p>One paragraph on what we're building and why it matters. If you can't say it in one paragraph, the scope is too big.</p></blockquote>
      <h3>Goals</h3>
      <ul>
        <li><strong>Launch the customer dashboard</strong> — give every account a single place to see usage, invoices, and team members.</li>
        <li><strong>Cut support tickets by 30%</strong> — self-serve answers for the five most-asked billing questions.</li>
        <li><strong>Keep page loads under 2 seconds</strong> — measured at the 95th percentile on a mid-range phone.</li>
      </ul>
      <h3>Milestones</h3>
      <ol>
        <li><strong>Design freeze</strong> — mockups signed off, edge cases listed. <em>Due Friday.</em></li>
        <li><strong>Working prototype</strong> — real data behind a feature flag, demoable internally.</li>
        <li><strong>Beta with five customers</strong> — weekly feedback calls, bug list triaged daily.</li>
        <li><strong>General availability</strong> — rollout plan and rollback steps agreed.</li>
      </ol>
      <h3>Risks</h3>
      <ul>
        <li><strong>Billing API rate limits</strong> — cache invoice summaries; fall back to stale data with a timestamp rather than failing.</li>
        <li><strong>Scope creep on the settings page</strong> — anything not in the launch checklist goes to a v1.1 list, no exceptions.</li>
        <li><strong>Only one person knows the auth flow</strong> — pair on it this week so knowledge is shared before beta.</li>
      </ul>
      <h3>Open questions</h3>
      ${taskList([
        taskItem('Who approves the final copy for empty states?'),
        taskItem('Do we need SSO for launch, or can it wait for v1.1?'),
      ])}
    `,
  },
  {
    id: 'reading-list',
    name: 'Reading list',
    icon: '📚',
    description: 'Track books by title, author, status, and your rating.',
    initialHtml: `
      <h2>Reading list</h2>
      <h3>Currently reading</h3>
      <ul>
        <li><strong>The Design of Everyday Things</strong> — Don Norman · <em>Reading</em> · ★★★★☆ — Re-reading the chapter on affordances; the door examples never get old.</li>
        <li><strong>A Philosophy of Software Design</strong> — John Ousterhout · <em>Reading</em> · ★★★★★ — "Define errors out of existence" is changing how I write APIs.</li>
      </ul>
      <h3>Up next</h3>
      <ul>
        <li><strong>The Making of Prince of Persia</strong> — Jordan Mechner · <em>Want to read</em> — His journals from building the game in the late 80s.</li>
        <li><strong>Several Short Sentences About Writing</strong> — Verlyn Klinkenborg · <em>Want to read</em> — Recommended for tightening prose.</li>
      </ul>
      <h3>Finished</h3>
      <ul>
        <li><strong>Working in Public</strong> — Nadia Eghbal · <em>Finished</em> · ★★★★☆ — Best mental model I've seen for open-source maintenance.</li>
        <li><strong>Shape Up</strong> — Ryan Singer · <em>Finished</em> · ★★★★☆ — The six-week cycle idea is worth stealing for side projects.</li>
      </ul>
      <h3>Rating key</h3>
      <p>★★★★★ loved it · ★★★★☆ very good · ★★★☆☆ decent · ★★☆☆☆ meh · ★☆☆☆☆ abandoned</p>
    `,
  },
  {
    id: 'daily-journal',
    name: 'Daily journal',
    icon: '📓',
    description: "Date, gratitude, today's tasks, and free-form notes.",
    initialHtml: `
      <h2>${todayLong()}</h2>
      <h3>Gratitude</h3>
      <p>Three specific things, however small:</p>
      <ol>
        <li>Morning coffee on the balcony before the day started.</li>
        <li>The bug that turned out to be a one-line fix.</li>
        <li>A friend who called just to check in.</li>
      </ol>
      <h3>Today's tasks</h3>
      ${taskList([
        taskItem('Finish the draft and send it for review', true),
        taskItem('30-minute walk, no phone'),
        taskItem('Read 20 pages before bed'),
      ])}
      <h3>Notes</h3>
      <p>What happened today worth remembering? What did you learn, notice, or decide? Write it the way you'd tell a friend — nobody grades a journal.</p>
      <h3>Tomorrow</h3>
      <p>One thing that would make tomorrow a good day:</p>
    `,
  },
];

/* ------------------------------------------------------------------ */
/* Database templates                                                  */
/* ------------------------------------------------------------------ */

/** A column spec — ids are minted when the database is built. */
export interface DatabasePropertySpec {
  name: string;
  type: PropertyType;
  options?: string[];
}

export interface DatabaseTemplate {
  id: string;
  name: string;
  icon: string;
  description: string;
  properties: DatabasePropertySpec[];
  /** Sample rows, keyed by property *name* (mapped to ids at build time). */
  rows: Array<Record<string, string | number>>;
}

export const databaseTemplates: DatabaseTemplate[] = [
  {
    id: 'task-tracker',
    name: 'Task tracker',
    icon: '✅',
    description: 'Tasks with status, priority, due date, and assignee.',
    properties: [
      { name: 'Task', type: 'text' },
      { name: 'Status', type: 'select', options: ['Todo', 'In progress', 'Done'] },
      { name: 'Priority', type: 'select', options: ['Low', 'Medium', 'High'] },
      { name: 'Due', type: 'date' },
      { name: 'Assignee', type: 'text' },
    ],
    rows: [
      {
        Task: 'Write the launch announcement draft',
        Status: 'In progress',
        Priority: 'High',
        Due: isoDaysFromNow(1),
        Assignee: 'Ada',
      },
      {
        Task: 'Review pull request #214 (billing refactor)',
        Status: 'Todo',
        Priority: 'High',
        Due: isoDaysFromNow(2),
        Assignee: 'Grace',
      },
      {
        Task: 'Update the onboarding screenshots',
        Status: 'Todo',
        Priority: 'Medium',
        Due: isoDaysFromNow(4),
        Assignee: 'Alan',
      },
      {
        Task: 'Schedule the beta feedback calls',
        Status: 'Todo',
        Priority: 'Medium',
        Due: isoDaysFromNow(6),
        Assignee: 'Ada',
      },
      {
        Task: 'Renew the domain before it expires',
        Status: 'Done',
        Priority: 'Low',
        Due: isoDaysFromNow(-2),
        Assignee: 'Grace',
      },
    ],
  },
  {
    id: 'content-calendar',
    name: 'Content calendar',
    icon: '🗓️',
    description: 'Planned posts with channel, publish date, and status.',
    properties: [
      { name: 'Title', type: 'text' },
      {
        name: 'Channel',
        type: 'select',
        options: ['Blog', 'Newsletter', 'YouTube', 'Social'],
      },
      { name: 'Publish', type: 'date' },
      {
        name: 'Status',
        type: 'select',
        options: ['Idea', 'Draft', 'Scheduled', 'Published'],
      },
    ],
    rows: [
      {
        Title: 'How we cut page load time by 60%',
        Channel: 'Blog',
        Publish: isoDaysFromNow(3),
        Status: 'Draft',
      },
      {
        Title: 'October product update',
        Channel: 'Newsletter',
        Publish: isoDaysFromNow(5),
        Status: 'Idea',
      },
      {
        Title: 'A tour of the new dashboard',
        Channel: 'YouTube',
        Publish: isoDaysFromNow(9),
        Status: 'Idea',
      },
      {
        Title: 'Behind the scenes: our design tokens',
        Channel: 'Social',
        Publish: isoDaysFromNow(1),
        Status: 'Scheduled',
      },
      {
        Title: 'Why we went local-first',
        Channel: 'Blog',
        Publish: isoDaysFromNow(-7),
        Status: 'Published',
      },
    ],
  },
  {
    id: 'simple-crm',
    name: 'Simple CRM',
    icon: '🤝',
    description: 'Contacts with company, pipeline stage, and deal value.',
    properties: [
      { name: 'Name', type: 'text' },
      { name: 'Company', type: 'text' },
      {
        name: 'Stage',
        type: 'select',
        options: ['Lead', 'Contacted', 'Demo', 'Negotiation', 'Won', 'Lost'],
      },
      { name: 'Last contact', type: 'date' },
      { name: 'Value', type: 'number' },
    ],
    rows: [
      {
        Name: 'Maya Chen',
        Company: 'Northwind Traders',
        Stage: 'Negotiation',
        'Last contact': isoDaysFromNow(-1),
        Value: 12000,
      },
      {
        Name: 'Ravi Patel',
        Company: 'Initech',
        Stage: 'Demo',
        'Last contact': isoDaysFromNow(-3),
        Value: 8500,
      },
      {
        Name: 'Sofia Rossi',
        Company: 'Acme Corp',
        Stage: 'Contacted',
        'Last contact': isoDaysFromNow(-6),
        Value: 4000,
      },
      {
        Name: 'Jonas Weber',
        Company: 'Globex',
        Stage: 'Lead',
        'Last contact': isoDaysFromNow(-9),
        Value: 15000,
      },
      {
        Name: 'Amara Okafor',
        Company: 'Umbrella Health',
        Stage: 'Won',
        'Last contact': isoDaysFromNow(-14),
        Value: 22000,
      },
    ],
  },
];

/**
 * Build a real FolioDatabase from a template: mint fresh ids, map the sample
 * rows from property names to ids, and wire kanban/calendar to the first
 * select/date property so the extra views work out of the box.
 */
export function buildDatabaseFromTemplate(template: DatabaseTemplate): FolioDatabase {
  const idByName = new Map<string, string>();
  const properties = template.properties.map((spec) => {
    const id = newDbId('prop');
    idByName.set(spec.name, id);
    return {
      id,
      name: spec.name,
      type: spec.type,
      ...(spec.options ? { options: [...spec.options] } : {}),
    };
  });
  const rows = template.rows.map((row) => {
    const cells: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(row)) {
      const id = idByName.get(name);
      if (id) cells[id] = value;
    }
    return { id: newDbId('row'), cells };
  });
  const kanbanGroupBy = properties.find((p) => p.type === 'select')?.id ?? null;
  const calendarDateProp = properties.find((p) => p.type === 'date')?.id ?? null;
  const dateProps = properties.filter((p) => p.type === 'date');
  return {
    id: newDbId('db'),
    title: template.name,
    icon: template.icon,
    properties,
    rows,
    view: 'table',
    kanbanGroupBy,
    calendarDateProp,
    timelineStartProp: dateProps[0]?.id ?? null,
    timelineEndProp: dateProps[1]?.id ?? null,
    updatedAt: Date.now(),
  };
}
