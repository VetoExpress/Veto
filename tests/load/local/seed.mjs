import { pbkdf2Sync, randomBytes, randomUUID } from 'node:crypto'

const sharedCapabilities = [
  'view_conference',
  'view_situation',
  'view_news',
  'view_files',
  'send_files',
  'review_files',
  'review_news',
  'submit_directive',
  'process_directive',
  'withdraw_news',
  'withdraw_situation',
  'withdraw_files',
  'control_conference'
]

export function organizerSeed() {
  const id = randomUUID()
  const email = `load-${id}@example.invalid`
  const password = randomBytes(24).toString('hex')
  // Matches veto-api/src/lib/password.ts, including salt/key lengths and iterations.
  const salt = randomBytes(16)
  const hash = pbkdf2Sync(password, salt, 100000, 32, 'sha256')
  const stored = `pbkdf2$100000$${salt.toString('hex')}$${hash.toString('hex')}`
  return {
    email,
    password,
    sql: `INSERT INTO users (id, email, name, password, organization)
VALUES ('${id}', '${email}', 'Local load organizer', '${stored}', 'Local load testing');\n`
  }
}

export function conferenceInput(count) {
  const committees = []
  // Interleave the fixture later, so even a short prefix contains both committee types.
  for (const type of ['mpc', 'ipc']) {
    let remaining = type === 'mpc' ? Math.ceil(count / 2) : Math.floor(count / 2)
    for (let group = 0; remaining > 0; group++) {
      const size = Math.min(remaining, 500)
      const clientId = `load-${type}-${group}`
      committees.push({
        clientId,
        name: `Load ${type.toUpperCase()} ${group + 1}`,
        type,
        seats: Array.from({ length: size }, (_, index) => ({
          clientId: `${clientId}-seat-${index}`,
          name: `${type.toUpperCase()} ${group * 500 + index + 1}`,
          roleTemplateId: `load-role-${type}`,
          hasVotingRights: true
        }))
      })
      remaining -= size
    }
  }
  const now = Date.now()
  return {
    name: `Local load ${new Date(now).toISOString()}`,
    organizer: 'Local load testing',
    startsAt: new Date(now - 3600000).toISOString(),
    endsAt: new Date(now + 7 * 86400000).toISOString(),
    roleTemplates: [
      {
        clientId: 'load-role-mpc',
        name: 'Load MPC',
        systemCode: 'mpc_press',
        capabilities: [...sharedCapabilities, 'draft_news']
      },
      {
        clientId: 'load-role-ipc',
        name: 'Load IPC',
        systemCode: 'ipc',
        capabilities: [...sharedCapabilities, 'publish_situation', 'control_timeline']
      }
    ],
    committees
  }
}

export function seatFixtures(conference) {
  const roles = new Map(conference.roleTemplates.map((role) => [role.id, role]))
  const byType = ['mpc', 'ipc'].map((type) =>
    conference.committees
      .filter((committee) => committee.type === type)
      .flatMap((committee) =>
        committee.seats.map((seat) => ({
          inviteCode: seat.inviteCode,
          password: randomBytes(20).toString('hex'),
          seatId: seat.id,
          conferenceId: conference.id,
          committeeId: committee.id,
          targetCommitteeId: conference.committees.find((target) => target.type !== type).id,
          expectedCapabilities: roles.get(seat.roleTemplateId).capabilities
        }))
      )
  )
  return Array.from({ length: Math.max(...byType.map((seats) => seats.length)) }, (_, index) =>
    byType.flatMap((seats) => (seats[index] ? [seats[index]] : []))
  ).flat()
}
