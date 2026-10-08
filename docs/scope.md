# JomLepakz Project Scope

## Product summary

JomLepakz is a student activity platform for Universiti Malaya (UM), built around one simple idea:

> Find someone at UM to do something with.

The product helps UM students turn an activity idea into an in-person meetup through the core loop:

> Post → Discover → Join → Meet

## V1 objective

V1 will provide a safe, mobile-responsive way for verified UM students to create, discover, join, and coordinate activities. The initial beta is intended for **10–20 UM students** and should prioritize a reliable core loop over feature breadth.

## Target users

- UM students who want companions for casual, academic, sporting, social, or interest-based activities.
- Student hosts who want to organize a small activity and manage participants.
- Administrators who need basic tools to review reports and moderate users or activities.

## V1 user journey

1. A UM student signs in and completes a basic profile.
2. The student discovers or searches for a suitable activity.
3. The student reviews its details and joins immediately or requests host approval.
4. The host manages the activity and its participants.
5. Participants coordinate through the activity's shared messaging area and receive in-app notifications.
6. The group meets and completes the activity.
7. Participants may submit private feedback or report a safety or community issue.

## V1 scope

### Account and profile

- UM student authentication.
- A basic student profile with the information needed to participate in activities.
- Privacy controls appropriate to the information shown to other participants.
- Blocking so a student can prevent unwanted interaction with another user.

### Activity discovery

- A browsable activity feed or list.
- Activity details, including the host, description, date and time, location text, capacity, participation status, and relevant expectations.
- Search and practical filters for narrowing available activities.
- Saved activities for later review.

### Activity hosting

- Create an activity.
- Edit an activity before completion, subject to clear rules when participants have already joined.
- Cancel an activity and notify affected participants.
- Optional host approval, allowing the host to accept or decline join requests.
- Participant management appropriate to hosting an activity.

### Participation

- Join an activity or request to join when host approval is enabled.
- Leave an activity.
- Clear status feedback for joined, pending, declined, cancelled, completed, and full activities.
- My Activities/dashboard for hosting, upcoming participation, pending requests, saved activities, completed activities, and cancellations.

### Coordination and communication

- Messaging tied to an activity and available only to the relevant host and participants.
- In-app notifications for important activity events, including join updates, approval decisions, changes, cancellations, and messages.
- No unrestricted or random direct messaging between students.

### Completion and feedback

- Mark or transition an activity to completed after its scheduled time.
- Private post-activity feedback for product quality and safety review.
- No public star ratings.

### Trust, safety, and moderation

- Reporting for users, activities, messages, or relevant conduct.
- Blocking controls that are respected across discovery, participation, and communication.
- Basic administrator moderation to review reports and take proportionate action on users, activities, or content.
- Safety, community guidelines, and privacy pages accessible within the product.

### Experience and compatibility

- Mobile-responsive web UI covering the complete V1 journey.
- Clear empty, loading, validation, error, and success states for core actions.
- Basic accessibility practices for navigation, forms, content, and status messages.

## Roles and permissions

### Student

- Manage their own profile.
- Discover, search, filter, and save activities.
- Create and manage activities they host.
- Join, request to join, or leave eligible activities.
- Participate in messaging for their activities.
- Receive in-app notifications.
- Block users, submit reports, and provide private feedback.

### Host

A host is a student with additional permissions for an activity they created. The host can edit or cancel that activity, review join requests when approval is enabled, and manage participation within the platform's moderation rules.

### Administrator

- Access a basic moderation view.
- Review submitted reports and their relevant context.
- Apply and record basic moderation actions.
- Manage clearly unsafe or policy-breaking users, activities, or content.

## Core business rules

- Access is limited to authenticated UM students, apart from any public legal, safety, community, or privacy information intentionally made available before sign-in.
- Each activity has one host and a defined date, time, location description, capacity, and participation mode.
- Joining must respect activity status, capacity, blocking, and host-approval settings.
- Activity messaging is contextual: access depends on a user's valid relationship to that activity.
- Users affected by material activity changes or cancellation receive an in-app notification.
- Blocking must prevent inappropriate visibility or interaction without exposing unnecessary information to the blocked user.
- Reports and private feedback are not publicly displayed.
- Administrative actions should be limited, reviewable, and recorded.

## Out of scope for V1

The following are explicitly excluded:

- AI recommendations.
- Maps or map-based discovery.
- Public star ratings.
- Random or unrestricted direct messaging.
- Push notifications.
- A native mobile application.
- Payments or financial transactions.
- Unnecessary future-facing features that do not support the V1 core loop or beta learning goals.

## Beta boundaries and success criteria

The first beta will target **10–20 UM students**. It should validate whether students can complete the core loop safely and without manual intervention from the product team.

The beta is ready when:

- A verified UM student can complete the Post → Discover → Join → Meet journey on a mobile-sized screen.
- Hosts can manage immediate joins and approval-based requests.
- Participants can coordinate within an activity and receive essential in-app updates.
- Reporting, blocking, and basic moderation flows work end to end.
- Completed activities can collect private feedback.
- No explicitly excluded feature is required to operate the beta.

Beta learning should focus on:

- Whether students understand how to create and join an activity.
- Whether enough relevant activities are discoverable for a small cohort.
- Where users abandon or misunderstand the core loop.
- Whether messaging and notifications support successful meetups.
- Whether safety controls and moderation are understandable and usable.

## Scope control

Any proposed addition should be accepted into V1 only if it is required for the core loop, user safety, privacy, moderation, or reliable beta operation. Other ideas should be recorded separately for later consideration rather than added to the V1 build.
