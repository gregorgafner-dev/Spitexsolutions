'use client'

import { useEffect, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import {
  Plus,
  Pencil,
  Trash2,
  KeyRound,
  UserCheck,
  UserX,
  Loader2,
  Mail,
  Phone,
} from 'lucide-react'

type Member = {
  id: string
  email: string
  firstName: string
  lastName: string
  role: 'PLANNER' | 'MEMBER'
  active: boolean
  phone: string | null
  notes: string | null
  createdAt: string
  updatedAt: string
}

type DialogMode =
  | { kind: 'closed' }
  | { kind: 'create' }
  | { kind: 'edit'; member: Member }
  | { kind: 'password'; member: Member }
  | { kind: 'delete'; member: Member }

export default function MembersAdminClient() {
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dialog, setDialog] = useState<DialogMode>({ kind: 'closed' })

  async function fetchMembers() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/pool/members', { cache: 'no-store' })
      if (!res.ok) throw new Error('Laden fehlgeschlagen')
      const data = await res.json()
      setMembers(data.members)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Fehler beim Laden')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchMembers()
  }, [])

  async function toggleActive(member: Member) {
    const res = await fetch(`/api/pool/members/${member.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ active: !member.active }),
    })
    if (!res.ok) {
      const data = await res.json().catch(() => ({}))
      alert(data.error || 'Aktualisieren fehlgeschlagen.')
      return
    }
    fetchMembers()
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div className="text-sm text-gray-600">
          {loading ? 'Lade…' : `${members.length} ${members.length === 1 ? 'Person' : 'Personen'} im Pool`}
        </div>
        <Button
          type="button"
          onClick={() => setDialog({ kind: 'create' })}
          className="bg-emerald-600 hover:bg-emerald-700"
        >
          <Plus className="mr-1 h-4 w-4" /> Neue Person
        </Button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-left text-xs font-medium uppercase tracking-wider text-gray-600">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Kontakt</th>
              <th className="px-4 py-3">Rolle</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Aktionen</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-400">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin" />
                </td>
              </tr>
            )}
            {!loading && members.length === 0 && (
              <tr>
                <td colSpan={5} className="px-4 py-10 text-center text-gray-500">
                  Noch keine Mitarbeitenden im Pool.
                </td>
              </tr>
            )}
            {members.map((m) => (
              <tr key={m.id} className={m.active ? '' : 'bg-gray-50/50 text-gray-500'}>
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">
                    {m.lastName}, {m.firstName}
                  </div>
                  {m.notes && (
                    <div className="mt-0.5 line-clamp-1 text-xs text-gray-500">{m.notes}</div>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5 text-gray-700">
                    <Mail className="h-3.5 w-3.5 text-gray-400" />
                    {m.email}
                  </div>
                  {m.phone && (
                    <div className="mt-0.5 flex items-center gap-1.5 text-gray-700">
                      <Phone className="h-3.5 w-3.5 text-gray-400" />
                      {m.phone}
                    </div>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.role === 'PLANNER' ? (
                    <Badge className="bg-indigo-100 text-indigo-800 hover:bg-indigo-100">Planung</Badge>
                  ) : (
                    <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100">Mitarbeiter:in</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  {m.active ? (
                    <Badge variant="outline" className="border-emerald-300 text-emerald-700">aktiv</Badge>
                  ) : (
                    <Badge variant="outline" className="border-gray-300 text-gray-500">inaktiv</Badge>
                  )}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1">
                    <IconButton
                      title="Bearbeiten"
                      onClick={() => setDialog({ kind: 'edit', member: m })}
                    >
                      <Pencil className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title="Passwort zurücksetzen"
                      onClick={() => setDialog({ kind: 'password', member: m })}
                    >
                      <KeyRound className="h-4 w-4" />
                    </IconButton>
                    <IconButton
                      title={m.active ? 'Deaktivieren' : 'Aktivieren'}
                      onClick={() => toggleActive(m)}
                    >
                      {m.active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                    </IconButton>
                    <IconButton
                      title="Löschen"
                      destructive
                      onClick={() => setDialog({ kind: 'delete', member: m })}
                    >
                      <Trash2 className="h-4 w-4" />
                    </IconButton>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Dialoge */}
      <MemberFormDialog
        open={dialog.kind === 'create' || dialog.kind === 'edit'}
        member={dialog.kind === 'edit' ? dialog.member : null}
        onClose={() => setDialog({ kind: 'closed' })}
        onSaved={() => {
          setDialog({ kind: 'closed' })
          fetchMembers()
        }}
      />
      <PasswordResetDialog
        open={dialog.kind === 'password'}
        member={dialog.kind === 'password' ? dialog.member : null}
        onClose={() => setDialog({ kind: 'closed' })}
        onSaved={() => setDialog({ kind: 'closed' })}
      />
      <DeleteDialog
        open={dialog.kind === 'delete'}
        member={dialog.kind === 'delete' ? dialog.member : null}
        onClose={() => setDialog({ kind: 'closed' })}
        onDeleted={() => {
          setDialog({ kind: 'closed' })
          fetchMembers()
        }}
      />
    </div>
  )
}

function IconButton({
  children,
  title,
  onClick,
  destructive,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
  destructive?: boolean
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      className={`rounded p-1.5 transition-colors ${
        destructive
          ? 'text-gray-500 hover:bg-red-50 hover:text-red-700'
          : 'text-gray-500 hover:bg-gray-100 hover:text-gray-900'
      }`}
    >
      {children}
    </button>
  )
}

function MemberFormDialog({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean
  member: Member | null
  onClose: () => void
  onSaved: () => void
}) {
  const isEdit = !!member
  const [email, setEmail] = useState('')
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [role, setRole] = useState<'PLANNER' | 'MEMBER'>('MEMBER')
  const [phone, setPhone] = useState('')
  const [notes, setNotes] = useState('')
  const [password, setPassword] = useState('')
  const [active, setActive] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) {
      setError(null)
      setSaving(false)
      if (member) {
        setEmail(member.email)
        setFirstName(member.firstName)
        setLastName(member.lastName)
        setRole(member.role)
        setPhone(member.phone ?? '')
        setNotes(member.notes ?? '')
        setActive(member.active)
        setPassword('')
      } else {
        setEmail('')
        setFirstName('')
        setLastName('')
        setRole('MEMBER')
        setPhone('')
        setNotes('')
        setActive(true)
        setPassword('')
      }
    }
  }, [open, member])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const url = isEdit ? `/api/pool/members/${member!.id}` : '/api/pool/members'
      const method = isEdit ? 'PATCH' : 'POST'
      const body: any = { email, firstName, lastName, role, phone, notes, active }
      if (!isEdit) body.password = password
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Speichern fehlgeschlagen.')
        return
      }
      onSaved()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Person bearbeiten' : 'Neue Person anlegen'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Stammdaten aktualisieren. Das Passwort wird hier nicht verändert.'
              : 'Mitarbeitende oder Planer erfassen. Anschliessend mit dem initialen Passwort einloggen.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="firstName">Vorname</Label>
              <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lastName">Nachname</Label>
              <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} required />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="email">E-Mail</Label>
            <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="role">Rolle</Label>
              <select
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value as 'PLANNER' | 'MEMBER')}
                className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="MEMBER">Mitarbeiter:in</option>
                <option value="PLANNER">Planung</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="phone">Telefon (optional)</Label>
              <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} />
            </div>
          </div>
          {!isEdit && (
            <div className="space-y-1">
              <Label htmlFor="password">Initiales Passwort (mind. 6 Zeichen)</Label>
              <Input
                id="password"
                type="text"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete="off"
              />
            </div>
          )}
          <div className="space-y-1">
            <Label htmlFor="notes">Notizen (optional)</Label>
            <Textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
            />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="rounded border-gray-300"
            />
            <span>Konto aktiv</span>
          </label>

          {error && (
            <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Speichern…' : isEdit ? 'Speichern' : 'Anlegen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function PasswordResetDialog({
  open,
  member,
  onClose,
  onSaved,
}: {
  open: boolean
  member: Member | null
  onClose: () => void
  onSaved: () => void
}) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [success, setSuccess] = useState(false)

  useEffect(() => {
    if (open) {
      setPassword('')
      setError(null)
      setSuccess(false)
    }
  }, [open])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!member) return
    setSaving(true)
    setError(null)
    try {
      const res = await fetch(`/api/pool/members/${member.id}/password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Passwort konnte nicht gesetzt werden.')
        return
      }
      setSuccess(true)
      setTimeout(() => onSaved(), 800)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Passwort zurücksetzen</DialogTitle>
          <DialogDescription>
            {member
              ? `Neues Passwort für ${member.firstName} ${member.lastName} setzen. Die Person muss es danach selbst ändern können (folgt in Phase 9).`
              : ''}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="newpw">Neues Passwort (mind. 6 Zeichen)</Label>
            <Input
              id="newpw"
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete="off"
            />
          </div>
          {error && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
          {success && <div className="rounded border border-emerald-200 bg-emerald-50 p-2 text-sm text-emerald-700">Passwort gesetzt.</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>
              Abbrechen
            </Button>
            <Button type="submit" disabled={saving || success} className="bg-emerald-600 hover:bg-emerald-700">
              {saving ? 'Setzen…' : 'Passwort setzen'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

function DeleteDialog({
  open,
  member,
  onClose,
  onDeleted,
}: {
  open: boolean
  member: Member | null
  onClose: () => void
  onDeleted: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (open) {
      setError(null)
      setBusy(false)
    }
  }, [open])

  async function handleDelete() {
    if (!member) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/pool/members/${member.id}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || 'Löschen fehlgeschlagen.')
        return
      }
      onDeleted()
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Person löschen</DialogTitle>
          <DialogDescription>
            {member
              ? `Soll ${member.firstName} ${member.lastName} wirklich gelöscht werden? Verfügbarkeiten und Buchungen dieser Person werden mitgelöscht. Tipp: "Deaktivieren" bewahrt die Historie.`
              : ''}
          </DialogDescription>
        </DialogHeader>
        {error && <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div>}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            Abbrechen
          </Button>
          <Button
            type="button"
            onClick={handleDelete}
            disabled={busy}
            className="bg-red-600 hover:bg-red-700"
          >
            {busy ? 'Löschen…' : 'Endgültig löschen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
