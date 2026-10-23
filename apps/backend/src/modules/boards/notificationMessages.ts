import type { Language } from './mailLayout.ts'

export type Why = 'assigned' | 'mentioned' | 'following' | 'reminder'

export interface NotificationMessages {
  someone: string
  assignedYou: (actor: string) => string
  mentionedYou: (actor: string) => string
  commented: (actor: string) => string
  renamed: (actor: string) => string
  priority: (actor: string, level: string | null) => string
  dueDate: (actor: string, date: string | null) => string
  deadline: (actor: string, date: string | null) => string
  section: (actor: string, section: string | null) => string
  board: (actor: string, board: string) => string
  completed: (actor: string) => string
  canceled: (actor: string) => string
  reopened: (actor: string) => string
  assigned: (actor: string, name: string) => string
  unassigned: (actor: string, name: string) => string
  labeled: (actor: string, name: string) => string
  unlabeled: (actor: string, name: string) => string
  fileAdded: (actor: string, name: string) => string
  fileRemoved: (actor: string, name: string) => string
  described: (actor: string) => string
  archived: (actor: string, archived: boolean) => string
  trashed: (actor: string, trashed: boolean) => string
  repeats: (actor: string, repeating: boolean) => string
  updated: (actor: string) => string
  reminder: (due: string | null) => string
  subjects: {
    assigned: (actor: string, task: string) => string
    mentioned: (actor: string, task: string) => string
    reminder: (task: string) => string
  }
  due: string
  priorityLabel: (level: string) => string
  open: string
  fallback: string
  why: Record<Why, (key: string) => string>
  all: string
}

export const NOTIFICATION_MESSAGES: Record<Language, NotificationMessages> = {
  en: {
    someone: 'Someone',
    assignedYou: actor => `${actor} assigned you a task`,
    mentionedYou: actor => `${actor} mentioned you in a comment`,
    commented: actor => `${actor} commented`,
    renamed: actor => `${actor} renamed the task`,
    priority: (actor, level) =>
      level
        ? `${actor} set the priority to ${level}`
        : `${actor} removed the priority`,
    dueDate: (actor, date) =>
      date
        ? `${actor} set the due date to ${date}`
        : `${actor} removed the due date`,
    deadline: (actor, date) =>
      date
        ? `${actor} set the deadline to ${date}`
        : `${actor} removed the deadline`,
    section: (actor, section) =>
      section
        ? `${actor} moved the task to ${section}`
        : `${actor} moved the task out of its section`,
    board: (actor, board) => `${actor} moved the task to the board ${board}`,
    completed: actor => `${actor} completed the task`,
    canceled: actor => `${actor} canceled the task`,
    reopened: actor => `${actor} reopened the task`,
    assigned: (actor, name) => `${actor} assigned ${name}`,
    unassigned: (actor, name) => `${actor} unassigned ${name}`,
    labeled: (actor, name) => `${actor} added the label ${name}`,
    unlabeled: (actor, name) => `${actor} removed the label ${name}`,
    fileAdded: (actor, name) => `${actor} added the file ${name}`,
    fileRemoved: (actor, name) => `${actor} removed the file ${name}`,
    described: actor => `${actor} edited the description`,
    archived: (actor, archived) =>
      archived
        ? `${actor} archived the task`
        : `${actor} restored the task from the archive`,
    trashed: (actor, trashed) =>
      trashed
        ? `${actor} deleted the task`
        : `${actor} restored the task from the trash`,
    repeats: (actor, repeating) =>
      repeating
        ? `${actor} set the task to repeat`
        : `${actor} stopped the task from repeating`,
    updated: actor => `${actor} updated the task`,
    reminder: due => (due ? `Reminder: due ${due}` : 'Reminder'),
    subjects: {
      assigned: (actor, task) => `${actor} assigned you ${task}`,
      mentioned: (actor, task) => `${actor} mentioned you on ${task}`,
      reminder: task => `Reminder: ${task}`
    },
    due: 'Due',
    priorityLabel: level => `Priority ${level}`,
    open: 'Open task',
    fallback: 'Or open this link:',
    why: {
      assigned: key => `You get this email because you are assigned to ${key}.`,
      mentioned: key =>
        `You get this email because you were mentioned on ${key}.`,
      following: key => `You get this email because you follow ${key}.`,
      reminder: key =>
        `You get this email because you set a reminder on ${key}.`
    },
    all: 'See all notifications'
  },
  fr: {
    someone: 'Quelqu’un',
    assignedYou: actor => `${actor} vous a assigné une tâche`,
    mentionedYou: actor => `${actor} vous a mentionné dans un commentaire`,
    commented: actor => `${actor} a commenté`,
    renamed: actor => `${actor} a renommé la tâche`,
    priority: (actor, level) =>
      level
        ? `${actor} a mis la priorité à ${level}`
        : `${actor} a retiré la priorité`,
    dueDate: (actor, date) =>
      date
        ? `${actor} a fixé l’échéance au ${date}`
        : `${actor} a retiré l’échéance`,
    deadline: (actor, date) =>
      date
        ? `${actor} a fixé la date limite au ${date}`
        : `${actor} a retiré la date limite`,
    section: (actor, section) =>
      section
        ? `${actor} a déplacé la tâche dans ${section}`
        : `${actor} a sorti la tâche de sa section`,
    board: (actor, board) =>
      `${actor} a déplacé la tâche dans le tableau ${board}`,
    completed: actor => `${actor} a terminé la tâche`,
    canceled: actor => `${actor} a annulé la tâche`,
    reopened: actor => `${actor} a rouvert la tâche`,
    assigned: (actor, name) => `${actor} a assigné ${name}`,
    unassigned: (actor, name) => `${actor} a retiré ${name} de la tâche`,
    labeled: (actor, name) => `${actor} a ajouté l’étiquette ${name}`,
    unlabeled: (actor, name) => `${actor} a retiré l’étiquette ${name}`,
    fileAdded: (actor, name) => `${actor} a ajouté le fichier ${name}`,
    fileRemoved: (actor, name) => `${actor} a retiré le fichier ${name}`,
    described: actor => `${actor} a modifié la description`,
    archived: (actor, archived) =>
      archived
        ? `${actor} a archivé la tâche`
        : `${actor} a restauré la tâche depuis les archives`,
    trashed: (actor, trashed) =>
      trashed
        ? `${actor} a supprimé la tâche`
        : `${actor} a restauré la tâche depuis la corbeille`,
    repeats: (actor, repeating) =>
      repeating
        ? `${actor} a configuré la tâche pour se répéter`
        : `${actor} a arrêté la répétition de la tâche`,
    updated: actor => `${actor} a modifié la tâche`,
    reminder: due => (due ? `Rappel : échéance ${due}` : 'Rappel'),
    subjects: {
      assigned: (actor, task) => `${actor} vous a assigné ${task}`,
      mentioned: (actor, task) => `${actor} vous a mentionné sur ${task}`,
      reminder: task => `Rappel : ${task}`
    },
    due: 'Échéance',
    priorityLabel: level => `Priorité ${level}`,
    open: 'Ouvrir la tâche',
    fallback: 'Ou ouvrez ce lien :',
    why: {
      assigned: key =>
        `Vous recevez cet e-mail car vous êtes assigné à ${key}.`,
      mentioned: key =>
        `Vous recevez cet e-mail car vous avez été mentionné sur ${key}.`,
      following: key => `Vous recevez cet e-mail car vous suivez ${key}.`,
      reminder: key =>
        `Vous recevez cet e-mail car vous avez programmé un rappel sur ${key}.`
    },
    all: 'Voir toutes les notifications'
  },
  de: {
    someone: 'Jemand',
    assignedYou: actor => `${actor} hat dir eine Aufgabe zugewiesen`,
    mentionedYou: actor => `${actor} hat dich in einem Kommentar erwähnt`,
    commented: actor => `${actor} hat kommentiert`,
    renamed: actor => `${actor} hat die Aufgabe umbenannt`,
    priority: (actor, level) =>
      level
        ? `${actor} hat die Priorität auf ${level} gesetzt`
        : `${actor} hat die Priorität entfernt`,
    dueDate: (actor, date) =>
      date
        ? `${actor} hat das Fälligkeitsdatum auf ${date} gesetzt`
        : `${actor} hat das Fälligkeitsdatum entfernt`,
    deadline: (actor, date) =>
      date
        ? `${actor} hat die Frist auf ${date} gesetzt`
        : `${actor} hat die Frist entfernt`,
    section: (actor, section) =>
      section
        ? `${actor} hat die Aufgabe nach ${section} verschoben`
        : `${actor} hat die Aufgabe aus ihrem Abschnitt genommen`,
    board: (actor, board) =>
      `${actor} hat die Aufgabe in das Board ${board} verschoben`,
    completed: actor => `${actor} hat die Aufgabe erledigt`,
    canceled: actor => `${actor} hat die Aufgabe abgebrochen`,
    reopened: actor => `${actor} hat die Aufgabe wieder geöffnet`,
    assigned: (actor, name) => `${actor} hat ${name} zugewiesen`,
    unassigned: (actor, name) => `${actor} hat ${name} entfernt`,
    labeled: (actor, name) => `${actor} hat das Label ${name} hinzugefügt`,
    unlabeled: (actor, name) => `${actor} hat das Label ${name} entfernt`,
    fileAdded: (actor, name) => `${actor} hat die Datei ${name} hinzugefügt`,
    fileRemoved: (actor, name) => `${actor} hat die Datei ${name} entfernt`,
    described: actor => `${actor} hat die Beschreibung bearbeitet`,
    archived: (actor, archived) =>
      archived
        ? `${actor} hat die Aufgabe archiviert`
        : `${actor} hat die Aufgabe aus dem Archiv wiederhergestellt`,
    trashed: (actor, trashed) =>
      trashed
        ? `${actor} hat die Aufgabe gelöscht`
        : `${actor} hat die Aufgabe aus dem Papierkorb wiederhergestellt`,
    repeats: (actor, repeating) =>
      repeating
        ? `${actor} hat die Aufgabe auf Wiederholung gestellt`
        : `${actor} hat die Wiederholung der Aufgabe beendet`,
    updated: actor => `${actor} hat die Aufgabe geändert`,
    reminder: due => (due ? `Erinnerung: fällig ${due}` : 'Erinnerung'),
    subjects: {
      assigned: (actor, task) => `${actor} hat dir ${task} zugewiesen`,
      mentioned: (actor, task) => `${actor} hat dich in ${task} erwähnt`,
      reminder: task => `Erinnerung: ${task}`
    },
    due: 'Fällig',
    priorityLabel: level => `Priorität ${level}`,
    open: 'Aufgabe öffnen',
    fallback: 'Oder öffne diesen Link:',
    why: {
      assigned: key =>
        `Du erhältst diese E-Mail, weil dir ${key} zugewiesen ist.`,
      mentioned: key =>
        `Du erhältst diese E-Mail, weil du in ${key} erwähnt wurdest.`,
      following: key => `Du erhältst diese E-Mail, weil du ${key} folgst.`,
      reminder: key =>
        `Du erhältst diese E-Mail, weil du eine Erinnerung für ${key} gesetzt hast.`
    },
    all: 'Alle Benachrichtigungen ansehen'
  },
  it: {
    someone: 'Qualcuno',
    assignedYou: actor => `${actor} ti ha assegnato un’attività`,
    mentionedYou: actor => `${actor} ti ha menzionato in un commento`,
    commented: actor => `${actor} ha commentato`,
    renamed: actor => `${actor} ha rinominato l’attività`,
    priority: (actor, level) =>
      level
        ? `${actor} ha impostato la priorità a ${level}`
        : `${actor} ha rimosso la priorità`,
    dueDate: (actor, date) =>
      date
        ? `${actor} ha impostato la scadenza al ${date}`
        : `${actor} ha rimosso la scadenza`,
    deadline: (actor, date) =>
      date
        ? `${actor} ha impostato il termine al ${date}`
        : `${actor} ha rimosso il termine`,
    section: (actor, section) =>
      section
        ? `${actor} ha spostato l’attività in ${section}`
        : `${actor} ha tolto l’attività dalla sua sezione`,
    board: (actor, board) =>
      `${actor} ha spostato l’attività nella bacheca ${board}`,
    completed: actor => `${actor} ha completato l’attività`,
    canceled: actor => `${actor} ha annullato l’attività`,
    reopened: actor => `${actor} ha riaperto l’attività`,
    assigned: (actor, name) => `${actor} ha assegnato ${name}`,
    unassigned: (actor, name) => `${actor} ha rimosso ${name}`,
    labeled: (actor, name) => `${actor} ha aggiunto l’etichetta ${name}`,
    unlabeled: (actor, name) => `${actor} ha rimosso l’etichetta ${name}`,
    fileAdded: (actor, name) => `${actor} ha aggiunto il file ${name}`,
    fileRemoved: (actor, name) => `${actor} ha rimosso il file ${name}`,
    described: actor => `${actor} ha modificato la descrizione`,
    archived: (actor, archived) =>
      archived
        ? `${actor} ha archiviato l’attività`
        : `${actor} ha ripristinato l’attività dall’archivio`,
    trashed: (actor, trashed) =>
      trashed
        ? `${actor} ha eliminato l’attività`
        : `${actor} ha ripristinato l’attività dal cestino`,
    repeats: (actor, repeating) =>
      repeating
        ? `${actor} ha impostato l’attività come ricorrente`
        : `${actor} ha interrotto la ricorrenza dell’attività`,
    updated: actor => `${actor} ha modificato l’attività`,
    reminder: due => (due ? `Promemoria: scade ${due}` : 'Promemoria'),
    subjects: {
      assigned: (actor, task) => `${actor} ti ha assegnato ${task}`,
      mentioned: (actor, task) => `${actor} ti ha menzionato in ${task}`,
      reminder: task => `Promemoria: ${task}`
    },
    due: 'Scadenza',
    priorityLabel: level => `Priorità ${level}`,
    open: 'Apri l’attività',
    fallback: 'Oppure apri questo link:',
    why: {
      assigned: key => `Ricevi questa email perché sei assegnato a ${key}.`,
      mentioned: key =>
        `Ricevi questa email perché sei stato menzionato in ${key}.`,
      following: key => `Ricevi questa email perché segui ${key}.`,
      reminder: key =>
        `Ricevi questa email perché hai impostato un promemoria su ${key}.`
    },
    all: 'Vedi tutte le notifiche'
  },
  es: {
    someone: 'Alguien',
    assignedYou: actor => `${actor} te asignó una tarea`,
    mentionedYou: actor => `${actor} te mencionó en un comentario`,
    commented: actor => `${actor} comentó`,
    renamed: actor => `${actor} cambió el nombre de la tarea`,
    priority: (actor, level) =>
      level
        ? `${actor} puso la prioridad en ${level}`
        : `${actor} quitó la prioridad`,
    dueDate: (actor, date) =>
      date
        ? `${actor} fijó el vencimiento el ${date}`
        : `${actor} quitó el vencimiento`,
    deadline: (actor, date) =>
      date
        ? `${actor} fijó la fecha límite el ${date}`
        : `${actor} quitó la fecha límite`,
    section: (actor, section) =>
      section
        ? `${actor} movió la tarea a ${section}`
        : `${actor} sacó la tarea de su sección`,
    board: (actor, board) => `${actor} movió la tarea al tablero ${board}`,
    completed: actor => `${actor} completó la tarea`,
    canceled: actor => `${actor} canceló la tarea`,
    reopened: actor => `${actor} reabrió la tarea`,
    assigned: (actor, name) => `${actor} asignó a ${name}`,
    unassigned: (actor, name) => `${actor} quitó a ${name}`,
    labeled: (actor, name) => `${actor} añadió la etiqueta ${name}`,
    unlabeled: (actor, name) => `${actor} quitó la etiqueta ${name}`,
    fileAdded: (actor, name) => `${actor} añadió el archivo ${name}`,
    fileRemoved: (actor, name) => `${actor} quitó el archivo ${name}`,
    described: actor => `${actor} editó la descripción`,
    archived: (actor, archived) =>
      archived
        ? `${actor} archivó la tarea`
        : `${actor} restauró la tarea del archivo`,
    trashed: (actor, trashed) =>
      trashed
        ? `${actor} eliminó la tarea`
        : `${actor} restauró la tarea de la papelera`,
    repeats: (actor, repeating) =>
      repeating
        ? `${actor} configuró la tarea para repetirse`
        : `${actor} dejó de repetir la tarea`,
    updated: actor => `${actor} modificó la tarea`,
    reminder: due => (due ? `Recordatorio: vence ${due}` : 'Recordatorio'),
    subjects: {
      assigned: (actor, task) => `${actor} te asignó ${task}`,
      mentioned: (actor, task) => `${actor} te mencionó en ${task}`,
      reminder: task => `Recordatorio: ${task}`
    },
    due: 'Vence',
    priorityLabel: level => `Prioridad ${level}`,
    open: 'Abrir la tarea',
    fallback: 'O abre este enlace:',
    why: {
      assigned: key => `Recibes este correo porque tienes asignada ${key}.`,
      mentioned: key => `Recibes este correo porque te mencionaron en ${key}.`,
      following: key => `Recibes este correo porque sigues ${key}.`,
      reminder: key =>
        `Recibes este correo porque pusiste un recordatorio en ${key}.`
    },
    all: 'Ver todas las notificaciones'
  },
  ru: {
    someone: 'Кто-то',
    assignedYou: actor => `${actor} назначил(а) вам задачу`,
    mentionedYou: actor => `${actor} упомянул(а) вас в комментарии`,
    commented: actor => `${actor} оставил(а) комментарий`,
    renamed: actor => `${actor} переименовал(а) задачу`,
    priority: (actor, level) =>
      level
        ? `${actor} установил(а) приоритет ${level}`
        : `${actor} убрал(а) приоритет`,
    dueDate: (actor, date) =>
      date ? `${actor} установил(а) срок: ${date}` : `${actor} убрал(а) срок`,
    deadline: (actor, date) =>
      date
        ? `${actor} установил(а) крайний срок: ${date}`
        : `${actor} убрал(а) крайний срок`,
    section: (actor, section) =>
      section
        ? `${actor} переместил(а) задачу в ${section}`
        : `${actor} убрал(а) задачу из раздела`,
    board: (actor, board) => `${actor} переместил(а) задачу на доску ${board}`,
    completed: actor => `${actor} завершил(а) задачу`,
    canceled: actor => `${actor} отменил(а) задачу`,
    reopened: actor => `${actor} снова открыл(а) задачу`,
    assigned: (actor, name) => `${actor} назначил(а) ${name}`,
    unassigned: (actor, name) => `${actor} снял(а) ${name} с задачи`,
    labeled: (actor, name) => `${actor} добавил(а) метку ${name}`,
    unlabeled: (actor, name) => `${actor} убрал(а) метку ${name}`,
    fileAdded: (actor, name) => `${actor} добавил(а) файл ${name}`,
    fileRemoved: (actor, name) => `${actor} убрал(а) файл ${name}`,
    described: actor => `${actor} изменил(а) описание`,
    archived: (actor, archived) =>
      archived
        ? `${actor} архивировал(а) задачу`
        : `${actor} восстановил(а) задачу из архива`,
    trashed: (actor, trashed) =>
      trashed
        ? `${actor} удалил(а) задачу`
        : `${actor} восстановил(а) задачу из корзины`,
    repeats: (actor, repeating) =>
      repeating
        ? `${actor} сделал(а) задачу повторяющейся`
        : `${actor} отключил(а) повторение задачи`,
    updated: actor => `${actor} изменил(а) задачу`,
    reminder: due => (due ? `Напоминание: срок ${due}` : 'Напоминание'),
    subjects: {
      assigned: (actor, task) => `${actor} назначил(а) вам ${task}`,
      mentioned: (actor, task) => `${actor} упомянул(а) вас в ${task}`,
      reminder: task => `Напоминание: ${task}`
    },
    due: 'Срок',
    priorityLabel: level => `Приоритет ${level}`,
    open: 'Открыть задачу',
    fallback: 'Или откройте ссылку:',
    why: {
      assigned: key =>
        `Вы получили это письмо, потому что назначены на ${key}.`,
      mentioned: key =>
        `Вы получили это письмо, потому что вас упомянули в ${key}.`,
      following: key => `Вы получили это письмо, потому что следите за ${key}.`,
      reminder: key =>
        `Вы получили это письмо, потому что поставили напоминание на ${key}.`
    },
    all: 'Все уведомления'
  },
  vi: {
    someone: 'Ai đó',
    assignedYou: actor => `${actor} đã giao cho bạn một công việc`,
    mentionedYou: actor => `${actor} đã nhắc đến bạn trong một bình luận`,
    commented: actor => `${actor} đã bình luận`,
    renamed: actor => `${actor} đã đổi tên công việc`,
    priority: (actor, level) =>
      level
        ? `${actor} đã đặt mức ưu tiên ${level}`
        : `${actor} đã bỏ mức ưu tiên`,
    dueDate: (actor, date) =>
      date ? `${actor} đã đặt hạn vào ${date}` : `${actor} đã bỏ hạn`,
    deadline: (actor, date) =>
      date ? `${actor} đã đặt hạn chót vào ${date}` : `${actor} đã bỏ hạn chót`,
    section: (actor, section) =>
      section
        ? `${actor} đã chuyển công việc sang ${section}`
        : `${actor} đã đưa công việc ra khỏi mục`,
    board: (actor, board) => `${actor} đã chuyển công việc sang bảng ${board}`,
    completed: actor => `${actor} đã hoàn thành công việc`,
    canceled: actor => `${actor} đã hủy công việc`,
    reopened: actor => `${actor} đã mở lại công việc`,
    assigned: (actor, name) => `${actor} đã giao cho ${name}`,
    unassigned: (actor, name) => `${actor} đã gỡ ${name} khỏi công việc`,
    labeled: (actor, name) => `${actor} đã thêm nhãn ${name}`,
    unlabeled: (actor, name) => `${actor} đã bỏ nhãn ${name}`,
    fileAdded: (actor, name) => `${actor} đã thêm tệp ${name}`,
    fileRemoved: (actor, name) => `${actor} đã gỡ tệp ${name}`,
    described: actor => `${actor} đã sửa mô tả`,
    archived: (actor, archived) =>
      archived
        ? `${actor} đã lưu trữ công việc`
        : `${actor} đã khôi phục công việc từ kho lưu trữ`,
    trashed: (actor, trashed) =>
      trashed
        ? `${actor} đã xóa công việc`
        : `${actor} đã khôi phục công việc từ thùng rác`,
    repeats: (actor, repeating) =>
      repeating
        ? `${actor} đã đặt công việc lặp lại`
        : `${actor} đã tắt lặp lại của công việc`,
    updated: actor => `${actor} đã cập nhật công việc`,
    reminder: due => (due ? `Nhắc nhở: hạn ${due}` : 'Nhắc nhở'),
    subjects: {
      assigned: (actor, task) => `${actor} đã giao cho bạn ${task}`,
      mentioned: (actor, task) => `${actor} đã nhắc đến bạn trong ${task}`,
      reminder: task => `Nhắc nhở: ${task}`
    },
    due: 'Hạn',
    priorityLabel: level => `Ưu tiên ${level}`,
    open: 'Mở công việc',
    fallback: 'Hoặc mở liên kết này:',
    why: {
      assigned: key => `Bạn nhận email này vì bạn được giao ${key}.`,
      mentioned: key => `Bạn nhận email này vì bạn được nhắc đến trong ${key}.`,
      following: key => `Bạn nhận email này vì bạn theo dõi ${key}.`,
      reminder: key => `Bạn nhận email này vì bạn đã đặt nhắc nhở cho ${key}.`
    },
    all: 'Xem tất cả thông báo'
  }
}
