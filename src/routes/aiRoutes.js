const express = require('express');
const router = express.Router();
const db = require('../config/db');
const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy_key'
});

router.get('/debug-env', (req, res) => {
    res.json({ 
        key: process.env.GEMINI_API_KEY || 'undefined',
        keyLength: process.env.GEMINI_API_KEY ? process.env.GEMINI_API_KEY.length : 0
    });
});

router.post('/revise-chapter/:chapterId', async (req, res) => {
    try {
        const { chapterId } = req.params;
        
        // 1. Lấy thông tin chương từ database
        const chapter = db.prepare('SELECT * FROM chapters WHERE id = ?').get(chapterId);
        if (!chapter) {
            return res.status(404).json({ error: 'Không tìm thấy chương truyện.' });
        }

        if (!process.env.GEMINI_API_KEY) {
            console.log("DEBUG: GEMINI_API_KEY is falsy:", process.env.GEMINI_API_KEY);
            return res.status(500).json({ error: 'Chưa cấu hình GEMINI_API_KEY trên server.' });
        }

        console.log("DEBUG: Proceeding with AI revision using key:", process.env.GEMINI_API_KEY ? "EXISTS" : "MISSING");
        const originalText = chapter.content;
        
        // 2. Gửi request cho Gemini
        const prompt = `Bạn là một biên tập viên chuyên nghiệp. Dưới đây là nội dung một chương truyện. Hãy:
1. Sửa các lỗi chính tả nếu có.
2. Sửa các đoạn xuống dòng bị lỗi, căn lề, format cho văn bản trôi chảy và đẹp mắt.
3. Xóa mọi ký tự rác, watermark, link quảng cáo (vd: thuviensach.vn, tải sách miễn phí, v.v) nếu vẫn còn sót lại.
4. TUYỆT ĐỐI giữ nguyên cốt truyện, văn phong và toàn bộ nội dung. KHÔNG tóm tắt.
5. Chỉ trả về văn bản đã sửa, không thêm bất kỳ bình luận nào khác.

Nội dung:
${originalText}`;

        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
        });

        const revisedText = response.text;
        
        if (!revisedText) {
            return res.status(500).json({ error: 'AI không trả về kết quả hợp lệ.' });
        }

        // 3. Cập nhật database
        db.prepare('UPDATE chapters SET content = ? WHERE id = ?')
          .run(revisedText, chapterId);

        res.json({ message: 'Chỉnh lý thành công.', chapterId });

    } catch (error) {
        console.error('Lỗi khi gọi AI chỉnh lý:', error);
        res.status(500).json({ error: 'Đã có lỗi xảy ra trong quá trình chỉnh lý AI.', details: error.message });
    }
});

module.exports = router;
