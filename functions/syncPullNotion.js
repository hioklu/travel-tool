const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const notionService = require('./notionService');


/**
 * Scheduled function to poll Notion databases for updates.
 * Runs every 10 minutes (can be adjusted).
 */
exports.syncPullNotion = functions.pubsub.schedule('every 10 minutes').onRun(async (context) => {
    console.log('Starting scheduled Notion Pull Sync');

    try {
        const db = admin.firestore();
        // 1. Find all active trips that have a linked Notion Database
        const tripsSnapshot = await db.collection('trips')
            .where('notionConfigDatabaseId', '!=', null)
            .get();

        if (tripsSnapshot.empty) {
            console.log('No active trips with Notion integration found.');
            return null;
        }

        // 2. Iterate through each trip to fetch updates
        for (const tripDoc of tripsSnapshot.docs) {
            const tripData = tripDoc.data();
            const notionDbId = tripData.notionConfigDatabaseId;
            const tripId = tripDoc.id;

            // We use lastSyncedAt to filter out old edits
            // If it's the first time or missing, we fall back to a reasonable past date
            const lastSyncedAt = tripData.lastSyncedAt ? tripData.lastSyncedAt.toDate() : new Date(0);

            console.log(`Polling Notion DB ${notionDbId} for Trip ${tripId}, changes since ${lastSyncedAt.toISOString()}`);

            const recentNotionItems = await notionService.getRecentModifications(notionDbId, lastSyncedAt);

            if (recentNotionItems.length === 0) {
                console.log(`No new changes in Notion for trip ${tripId}.`);
                continue;
            }

            // 3. Process each changed item from Notion
            let syncCount = 0;
            const batch = db.batch();

            for (const item of recentNotionItems) {
                const notionPageId = item.id;
                const lastEditedTime = new Date(item.last_edited_time);

                // Find the corresponding itinerary event in Firebase
                // Note: We need a reliable way to map it. 
                // We assume there's an itinerary subcollection or a unified events subcollection.
                // Here we simulate searching the itinerary subcollection by notionPageId_detail:

                const eventsSnapshot = await db.collection('trips').doc(tripId).collection('itinerary')
                    .where('notionPageId_detail', '==', notionPageId)
                    .limit(1)
                    .get();

                if (!eventsSnapshot.empty) {
                    const eventDoc = eventsSnapshot.docs[0];
                    const eventData = eventDoc.data();
                    const fbUpdatedAt = eventData.updatedAt ? eventData.updatedAt.toDate() : new Date(0);

                    // Conflict resolution: Only update if Notion is strictly newer
                    // (Adding a slight buffer/epsilon might be needed in real prod due to sync latency)
                    if (lastEditedTime > fbUpdatedAt) {
                        const parsedData = notionService.parseItineraryItem(item);

                        batch.update(eventDoc.ref, {
                            ...parsedData, // update title, start, etc.
                            updatedAt: admin.firestore.Timestamp.fromDate(lastEditedTime)
                        });
                        syncCount++;
                    }
                } else {
                    // Item exists in Notion but not in Firebase (Created in Notion directly)
                    // We need to create it in Firebase!
                    const parsedData = notionService.parseItineraryItem(item);

                    // Note: Front-end groups by Date normally. 
                    const newEventRef = db.collection('trips').doc(tripId).collection('itinerary').doc();
                    batch.set(newEventRef, {
                        ...parsedData,
                        notionPageId_detail: notionPageId,
                        updatedAt: admin.firestore.Timestamp.fromDate(lastEditedTime)
                    });
                    syncCount++;
                }
            }

            // 4. Commit the batch updates to Firebase
            if (syncCount > 0) {
                // Update the trip's global sync timestamp
                batch.update(tripDoc.ref, {
                    lastSyncedAt: admin.firestore.FieldValue.serverTimestamp()
                });
                await batch.commit();
                console.log(`Successfully pulled & synced ${syncCount} items from Notion for Trip ${tripId}.`);
            }
        }
    } catch (error) {
        console.error("Error in syncPullNotion scheduled function:", error);
    }

    return null;
});
