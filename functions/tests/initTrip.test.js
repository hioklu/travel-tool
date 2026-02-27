require('dotenv').config();
const request = require('supertest');
const admin = require('firebase-admin');
const nock = require('nock');

// We need to initialize the app before tracking Firebase Functions 
// Usually we use firebase-functions-test for rigorous backend testing
const test = require('firebase-functions-test')({
    projectId: 'demo-travel-tool'
});

if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'demo-travel-tool' });
}

const myFunctions = require('../index.js');

// Mock Firestore explicitly to avoid any ADC or emulator connection errors
const mockSet = jest.fn().mockResolvedValue(true);
const mockDoc = jest.fn().mockReturnValue({ set: mockSet });
const mockWhere = jest.fn().mockReturnThis();
const mockGet = jest.fn().mockResolvedValue({ empty: false, docs: [{ data: () => ({ notionPageId: 'mock_notion_page_123', notionConfigDatabaseId: 'mock_notion_db_456', googleCalendarId: 'mock_gcal_id_123', createdBy: 'system_auto' }) }] });
const mockCollection = jest.fn().mockReturnValue({ doc: mockDoc, where: mockWhere, get: mockGet });
const mockFirestore = { collection: mockCollection };

const originalFieldValue = admin.firestore.FieldValue;
const originalTimestamp = admin.firestore.Timestamp;

jest.spyOn(admin, 'firestore').mockReturnValue(mockFirestore);
admin.firestore.FieldValue = originalFieldValue;
admin.firestore.Timestamp = originalTimestamp;


describe('initTrip Webhook Function', () => {

    beforeAll(() => {
        // Prevent actual outgoing network requests
        nock.disableNetConnect();
        nock.enableNetConnect('127.0.0.1'); // Allow local connection for Supertest if needed
    });

    afterAll(async () => {
        nock.enableNetConnect();
        test.cleanup();
        // Clean up mock trips if needed
    });

    afterEach(() => {
        nock.cleanAll();
    });

    it('should return 200 Sync OK for Google Validation Handshake', async () => {
        const req = { headers: { 'x-goog-resource-state': 'sync' } };
        const res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        await myFunctions.initTrip(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('Sync OK');
    });

    it('should successfully parse travel event, call Notion API, and write to Firestore', async () => {

        // 1. Mock Notion API responses
        // createNotionTripProject expects 2 calls: Create Page, Create Database
        nock('https://api.notion.com')
            .post('/v1/pages')
            .reply(200, { id: 'mock_notion_page_123' });

        nock('https://api.notion.com')
            .post('/v1/databases')
            .reply(200, { id: 'mock_notion_db_456' });

        // 2. Mock Request body
        const req = {
            headers: {},
            body: {
                eventSummary: "4/20~4/25 首爾 出國",
                startDate: "2026-04-20",
                endDate: "2026-04-25"
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        // 3. Execute
        await myFunctions.initTrip(req, res);

        // 4. Assert responses
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('Trip Initialized');

        // 5. Assert Firestore Data
        // Since we mocked Firestore entirely, we assert that collection().doc().set() was called correctly
        expect(mockCollection).toHaveBeenCalledWith('trips');
        expect(mockDoc).toHaveBeenCalled();
        expect(mockSet).toHaveBeenCalledWith(expect.objectContaining({
            title: "4/20~4/25 首爾 出國",
            notionPageId: 'mock_notion_page_123',
            notionConfigDatabaseId: 'mock_notion_db_456',
            googleCalendarId: 'mock_gcal_id_123'
        }));
    });

    it('should ignore non-travel events', async () => {
        const req = {
            headers: {},
            body: {
                eventSummary: "下午喝茶",
            }
        };

        const res = {
            status: jest.fn().mockReturnThis(),
            send: jest.fn()
        };

        await myFunctions.initTrip(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.send).toHaveBeenCalledWith('Ignored');
    });

});
