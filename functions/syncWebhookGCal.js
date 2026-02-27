const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { google } = require('googleapis');


// Requires valid refresh token to call Google APIs
// oauth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });



/**
 * Webhook endpoint for the Dedicated Google Calendars.
 * This URL must be registered when a new dedicated calendar is created.
 */
exports.syncWebhookGCal = functions.https.onRequest(async (req, res) => {
    // 1. Google Validation Handshake
    if (req.headers['x-goog-resource-state'] === 'sync') {
        return res.status(200).send('Sync OK');
    }

    try {
        const db = admin.firestore();
        const oauth2Client = new google.auth.OAuth2(
            process.env.GOOGLE_CLIENT_ID,
            process.env.GOOGLE_CLIENT_SECRET
        );
        const calendar = google.calendar({ version: 'v3', auth: oauth2Client });

        const channelId = req.headers['x-goog-channel-id'];
        const resourceId = req.headers['x-goog-resource-id'];

        if (!channelId || !resourceId) {
            return res.status(400).send('Missing headers');
        }

        console.log(`Received GCal Webhook for Channel ${channelId}`);

        // 2. Identify the Trip based on Channel ID
        // When registering the webhook, we should store the channelId in the trip document
        const tripsSnapshot = await db.collection('trips')
            .where('googleCalendarChannelId', '==', channelId)
            .limit(1)
            .get();

        if (tripsSnapshot.empty) {
            console.warn(`No Trip found for GCal Channel ${channelId}`);
            return res.status(200).send('Ignored');
        }

        const tripDoc = tripsSnapshot.docs[0];
        const tripData = tripDoc.data();
        const tripId = tripDoc.id;
        const dedicatedCalendarId = tripData.googleCalendarId;

        // 3. Fetch Incremental Changes from Google Calendar API
        // In a real implementation, we would use the `syncToken` saved from the previous run
        // to only fetch events changed since the last webhook.
        // For this prototype, we mock extracting an updated event.

        let latestSyncToken = tripData.gCalSyncToken || '';
        let updatedEvents = [];

        /* 
        // Real API Call Implementation:
        const response = await calendar.events.list({
            calendarId: dedicatedCalendarId,
            syncToken: latestSyncToken ? latestSyncToken : undefined,
            timeMin: !latestSyncToken ? new Date().toISOString() : undefined // Required if no syncToken
        });
        
        updatedEvents = response.data.items || [];
        const nextSyncToken = response.data.nextSyncToken;
        */

        // -- MOCK DATA BLOCK FOR PROTOTYPING --
        // Simulate dragging an event to a new time
        updatedEvents = [
            {
                id: "mock_gcal_evt_123", // corresponds to gCalEventId in Firebase itinerary
                summary: "Edited via GCal - Sushi",
                start: { dateTime: "2026-03-11T19:00:00+08:00" }, // New Time
                updated: new Date().toISOString() // Simulating it just happened
            }
        ];
        const nextSyncToken = "mock_sync_token_" + Date.now();
        // -- END MOCK --

        // 4. Process each updated event and sync to Firebase
        const batch = db.batch();
        let syncCount = 0;

        for (const gCalEvent of updatedEvents) {
            if (gCalEvent.status === 'cancelled') {
                // Handle deletion
                // Find and delete in Firebase
                continue;
            }

            const gCalEventId = gCalEvent.id;
            const updatedTime = new Date(gCalEvent.updated);

            // Find matching event in Firebase
            const eventsSnapshot = await db.collection('trips').doc(tripId).collection('itinerary')
                .where('gCalEventId', '==', gCalEventId)
                .limit(1)
                .get();

            if (!eventsSnapshot.empty) {
                const eventDoc = eventsSnapshot.docs[0];
                const fbUpdatedAt = eventDoc.data().updatedAt ? eventDoc.data().updatedAt.toDate() : new Date(0);

                // Conflict Resolution: Only pull if Google is strictly newer
                if (updatedTime > fbUpdatedAt) {

                    let newTimeStr = "";
                    if (gCalEvent.start && gCalEvent.start.dateTime) {
                        const dateObj = new Date(gCalEvent.start.dateTime);
                        // Convert to HH:mm string
                        newTimeStr = dateObj.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
                    }

                    batch.update(eventDoc.ref, {
                        title: gCalEvent.summary,
                        start: newTimeStr,
                        updatedAt: admin.firestore.Timestamp.fromDate(updatedTime)
                    });
                    syncCount++;
                }
            } else {
                // Event created in Google Calendar! We need to push to Firebase.
                const newEventRef = db.collection('trips').doc(tripId).collection('itinerary').doc();
                // Parse date/time...
                // batch.set(newEventRef, { ... });
            }
        }

        // 5. Update Sync Token and Run Batch
        if (syncCount > 0 || latestSyncToken !== nextSyncToken) {
            batch.update(tripDoc.ref, {
                gCalSyncToken: nextSyncToken,
                lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
            });
            await batch.commit();
            console.log(`Successfully pulled & synced ${syncCount} items from GCal for Trip ${tripId}.`);
        }

        return res.status(200).send('Sync Completed');

    } catch (error) {
        if (error.code === 410) {
            console.warn("Sync token expired, need to perform full sync and get new token.");
            return res.status(200).send('Sync token cleared');
        }
        console.error('Error in syncWebhookGCal:', error);
        return res.status(500).send('Internal Server Error');
    }
});
