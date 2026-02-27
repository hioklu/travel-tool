const { Client } = require('@notionhq/client');

// Initialize Notion Client
const notion = new Client({ auth: process.env.NOTION_TOKEN });
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

/**
 * Creates a new project Page in the main Flight Database,
 * and then creates a child Database inside that Page for itinerary details.
 * 
 * @param {string} tripTitle e.g., "3/10~3/16 北海道 出國"
 * @returns {Promise<{pageId: string, databaseId: string}>}
 */
async function createNotionTripProject(tripTitle) {
    try {
        // 1. Create a new Page in the main Flight Database
        const pageResponse = await notion.pages.create({
            parent: { database_id: NOTION_DATABASE_ID },
            properties: {
                // Assuming the main database has a title property named "Name" or "Title"
                // Adjust this key if your notion database uses a different name for the title column
                "Name": {
                    title: [
                        {
                            text: {
                                content: tripTitle
                            }
                        }
                    ]
                }
            }
        });

        const newPageId = pageResponse.id;
        console.log(`Successfully created Notion Page: ${newPageId}`);

        // 2. Create a new Database INSIDE the newly created Page for itinerary details
        // We will define standard properties: Date, Time, Title, Location, Type
        const databaseResponse = await notion.databases.create({
            parent: {
                type: "page_id",
                page_id: newPageId
            },
            title: [
                {
                    type: "text",
                    text: {
                        content: "行程細節 (Itinerary Details)"
                    }
                }
            ],
            properties: {
                "Title": { title: {} },
                "Date": { date: {} },
                "Time": { rich_text: {} },
                "Location": { url: {} },
                "Type": {
                    select: {
                        options: [
                            { name: "transport", color: "blue" },
                            { name: "flight", color: "red" },
                            { name: "hotel", color: "yellow" },
                            { name: "food", color: "orange" },
                            { name: "play", color: "green" },
                            { name: "ticket", color: "purple" },
                            { name: "star", color: "default" }
                        ]
                    }
                },
                "FirebaseID": { rich_text: {} },
                "LastUpdated": { last_edited_time: {} }
            }
        });

        const newDatabaseId = databaseResponse.id;
        console.log(`Successfully created Notion Database for Itinerary: ${newDatabaseId}`);

        return {
            pageId: newPageId,
            databaseId: newDatabaseId
        };
    } catch (error) {
        console.error("Error creating Notion Trip Project:", error);
        throw error;
    }
}

/**
 * Creates a new row (Page) in the Itinerary Database.
 */
async function createItineraryItemInNotion(databaseId, title, dateStr, timeStr) {
    try {
        const response = await notion.pages.create({
            parent: { database_id: databaseId },
            properties: {
                "Title": { title: [{ text: { content: title } }] },
                "Date": { date: { start: dateStr } },
                "Time": { rich_text: [{ text: { content: timeStr || "" } }] }
            }
        });
        return response.id;
    } catch (error) {
        console.error("Error creating itinerary item in Notion:", error);
        throw error;
    }
}

/**
 * Updates an existing row (Page) in the Itinerary Database.
 */
async function updateItineraryItemInNotion(pageId, title, timeStr) {
    try {
        const props = {};
        if (title) props["Title"] = { title: [{ text: { content: title } }] };
        if (timeStr !== undefined) props["Time"] = { rich_text: [{ text: { content: timeStr } }] };

        if (Object.keys(props).length === 0) return pageId;

        const response = await notion.pages.update({
            page_id: pageId,
            properties: props
        });
        return response.id;
    } catch (error) {
        console.error("Error updating itinerary item in Notion:", error);
        throw error;
    }
}

/**
 * Queries the database for items modified after a specific date.
 */
async function getRecentModifications(databaseId, afterDate) {
    try {
        const response = await notion.databases.query({
            database_id: databaseId,
            filter: {
                timestamp: "last_edited_time",
                last_edited_time: {
                    after: afterDate.toISOString() // Notion expects ISO 8601
                }
            }
        });
        return response.results;
    } catch (error) {
        console.error("Error fetching recent modifications from Notion:", error);
        throw error;
    }
}

/**
 * Helper to extract values from a Notion Page properties object.
 * Adjust based on exact property schema defined in createNotionTripProject.
 */
function parseItineraryItem(notionItem) {
    const props = notionItem.properties;

    // Extract Title
    let title = "";
    if (props.Title && props.Title.title && props.Title.title.length > 0) {
        title = props.Title.title[0].text.content;
    }

    // Extract Date
    let dateStr = "";
    if (props.Date && props.Date.date && props.Date.date.start) {
        dateStr = props.Date.date.start;
    }

    // Extract Time
    let timeStr = "";
    if (props.Time && props.Time.rich_text && props.Time.rich_text.length > 0) {
        timeStr = props.Time.rich_text[0].text.content;
    }

    return {
        title: title,
        date: dateStr,
        start: timeStr
    };
}

module.exports = {
    createNotionTripProject,
    createItineraryItemInNotion,
    updateItineraryItemInNotion,
    getRecentModifications,
    parseItineraryItem
};
