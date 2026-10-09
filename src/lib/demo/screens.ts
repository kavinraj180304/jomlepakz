// All identities, membership, messages, counts and reports below are fictional fixtures.
export type DemoProfile = { fullName: string; faculty: string; programme: string; year: string; bio: string; interests: readonly string[]; hosted: number; joined: number };
export const demoProfile: DemoProfile = { fullName: "Aiman Demo", faculty: "Faculty of Engineering", programme: "Chemical Engineering", year: "4", bio: "Always up for badminton, food and a good study session.", interests: ["Sports", "Food", "Study", "Networking", "Hobbies"], hosted: 3, joined: 7 };
export const savedActivityIds: readonly string[] = ["badminton-tonight", "library-study"];
export const hostingActivityIds: readonly string[] = ["badminton-tonight"];
export const joinedActivityIds: readonly string[] = ["lunch-buddies", "library-study"];
export type DemoNotification = { id: string; activityId: string; text: string; minutesAgo: number; time: string; unread: boolean; kind: "join" | "reminder" | "update" | "message" | "full" };
export const demoNotifications: readonly DemoNotification[] = [
  { id: "n1", activityId: "badminton-tonight", text: "Aiman joined Badminton Tonight", minutesAgo: 5, time: "5 min ago", unread: true, kind: "join" },
  { id: "n2", activityId: "badminton-tonight", text: "Badminton Tonight starts in 1 hour", minutesAgo: 55, time: "55 min ago", unread: true, kind: "reminder" },
  { id: "n3", activityId: "lunch-buddies", text: "Lunch Buddies has been updated", minutesAgo: 120, time: "2 hr ago", unread: true, kind: "update" },
  { id: "n4", activityId: "badminton-tonight", text: "Mei posted in the activity chat", minutesAgo: 180, time: "3 hr ago", unread: false, kind: "message" },
  { id: "n5", activityId: "library-study", text: "Library Study Session is now full", minutesAgo: 300, time: "5 hr ago", unread: false, kind: "full" },
];
export type DemoMessage = { id: string; sender: string; text: string; time: string; own: boolean };
export type DemoConversation = { activityId: string; preview: string; time: string; unread: number; messages: readonly DemoMessage[] };
export const demoConversations: readonly DemoConversation[] = [
  { activityId: "badminton-tonight", preview: "Mei: Bringing water too", time: "8:17 PM", unread: 2, messages: [
    { id: "b1", sender: "Aiman", text: "Anyone bringing shuttlecocks?", time: "8:15 PM", own: false },
    { id: "b2", sender: "You (demo)", text: "I've got a tube, see you all there", time: "8:16 PM", own: true },
    { id: "b3", sender: "Mei", text: "Bringing water too", time: "8:17 PM", own: false },
  ] },
  { activityId: "lunch-buddies", preview: "Hafiz: Meet at the entrance?", time: "12:05 PM", unread: 0, messages: [{ id: "l1", sender: "Hafiz", text: "Meet at the entrance?", time: "12:05 PM", own: false }] },
  { activityId: "library-study", preview: "Sarah: I'll bring my notes", time: "Yesterday", unread: 1, messages: [{ id: "s1", sender: "Sarah", text: "I'll bring my notes", time: "Yesterday", own: false }] },
];
export type DemoReport = { id: string; subject: string; reason: string; status: "Pending review" | "Reviewed" };
export const demoReports: readonly DemoReport[] = [{ id: "R-001", subject: "Demo activity listing", reason: "Unclear meeting location", status: "Pending review" }, { id: "R-002", subject: "Demo chat message", reason: "Community guideline concern", status: "Reviewed" }];
