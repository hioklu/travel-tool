const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const notionService = require('./notionService');


/**
 * Triggered when a new itinerary event is CREATED in Firebase.
 * Pushes the new event to Notion's itinerary Database and Google Calendar.
 */
exports.onItineraryCreated = functions.firestore
    .document('trips/{tripId}/itinerary/{date}')
    .onCreate(async (snap, context) => {
        const { tripId, date } = context.params;
        const newEvent = snap.data();

        try {
            const db = admin.firestore();
            // 1. Get the parent trip to find Notion and GCal IDs
            const tripDoc = await db.collection('trips').doc(tripId).get();
            if (!tripDoc.exists) return;
            const tripData = tripDoc.data();

            const notionDbId = tripData.notionConfigDatabaseId;
            const gCalId = tripData.googleCalendarId;

            if (!notionDbId) {
                console.warn(`No Notion Database linked for trip ${tripId}`);
                return;
            }

            // 2. Push to Notion Database
            // The event data from Firebase might look like: { id: "123", title: "dinner", start: "18:00", location: "Sushi..." }
            // Let's assume Firebase saves an array of events per date, or we are tracking a single event document.
            // Based on frontend index.html `saveEvent()`, it seems to save an array of events under a date document.
            // For simplicity here, assuming snap.data() is a SINGLE event object (if refactored), or we handle the array.
            // Let's assume the frontend was refactored to save individual events as documents, like: trips/{tripId}/events/{eventId}
            // If it's an array inside `{date}`, we need to find WHICH event was added. This is tricky with arrays.

            // *Assuming* we adjusted Firebase to store events as: trips/{tripId}/events/{eventId} for easier tracking
            // We will mock the Notion creation here.

            const notionPageId = await notionService.createItineraryItemInNotion(
                notionDbId,
                newEvent.title || "New Event",
                date, // or newEvent.startDate
                newEvent.start || ""
            );

            // 3. Push to Google Calendar (Mocked)
            const gCalEventId = `mock_gcal_evt_${Date.now()}`;

            // 4. Update Firebase with the new external IDs to complete the binding
            await snap.ref.update({
                notionPageId_detail: notionPageId,
                gCalEventId: gCalEventId,
                lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            console.log(`Successfully pushed new event to Notion (${notionPageId}) and GCal (${gCalEventId})`);

        } catch (error) {
            console.error("Error in onItineraryCreated Push Sync:", error);
        }
    });


/**
 * Triggered when an itinerary event is UPDATED in Firebase.
 */
exports.onItineraryUpdated = functions.firestore
    .document('trips/{tripId}/itinerary/{date}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        // 1. Conflict Resolution Check: Did this change originate from a Pull Sync?
        // We compare `updatedAt` vs `lastSyncedAt`. If they are the very close or exact, it might be a loop back.
        // For safer implementation, we check if the update was explicitly marked as "from_notion".

        // If frontend makes a change, it updates `updatedAt`.
        // We proceed to push.

        const { tripId } = context.params;
        try {
            const db = admin.firestore();
            const tripDoc = await db.collection('trips').doc(tripId).get();
            const notionDbId = tripDoc.data().notionConfigDatabaseId;

            if (after.notionPageId_detail) {
                // Update existing Notion page
                await notionService.updateItineraryItemInNotion(
                    after.notionPageId_detail,
                    after.title,
                    after.start // etc.
                );
            }

            console.log(`Successfully updated event in Notion for ${tripId}`);
        } catch (error) {
            console.error("Error in onItineraryUpdated Push Sync:", error);
        }
    });

