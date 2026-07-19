const express = require('express');
const router = express.Router();
const multer = require('multer');
const pdfParse = require('pdf-parse');
const fs = require('fs');
const crypto = require('crypto');
const path = require('path');
const db = require('../config/db');
const EPub = require('epub').EPub || require('epub');
const { convert } = require('html-to-text');
const { GoogleGenAI } = require('@google/genai');

const genAI = new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY || 'dummy_key'
});

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function cleanGarbageText(text) {
    if (!text) return '';
    let cleaned = text;
    // Xóa các link dạng https://thuviensach.vn
    cleaned = cleaned.replace(/https?:\/\/[^\s]*thuviensach\.vn[^\s]*/gi, '');
    // Xóa các text dạng thuviensach.vn
    cleaned = cleaned.replace(/thuviensach\.vn/gi, '');
    // Xóa các câu quảng cáo phổ biến
    cleaned = cleaned.replace(/Tải sách miễn phí tại[^\n]*/gi, '');
    cleaned = cleaned.replace(/Đọc sách online tại[^\n]*/gi, '');
    // Xóa các rác sinh ra do alt ảnh (phòng hờ)
    cleaned = cleaned.replace(/Image\s+\d+\s+\[.*?\]/gi, '');
    cleaned = cleaned.replace(/\[\/images\/.*?\]/gi, '');
    // Dọn dẹp khoảng trắng dư thừa
    cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();
    return cleaned;
}

async function parseEpubFile(filePath) {
    try {
        const epub = new EPub(filePath);
        await epub.parse();
        
        if (!epub.flow || epub.flow.length === 0) return [];

        let fullText = '';
        for (let i = 0; i < epub.flow.length; i++) {
            try {
                const text = await epub.getChapter(epub.flow[i].id);
                fullText += '\n\n' + convert(text || '', { 
                    wordwrap: false, 
                    selectors: [
                        { selector: 'img', format: 'skip' },
                        { selector: 'a', options: { ignoreHref: true } }
                    ] 
                });
            } catch (err) {
                console.error(`Error reading chapter ${epub.flow[i].id}:`, err);
            }
        }
        
        // Split by TOC titles if TOC exists
        const chapters = [];
        if (epub.toc && epub.toc.length > 0) {
            let lastIdx = 0;
            for (let i = 0; i < epub.toc.length; i++) {
                const tocItem = epub.toc[i];
                let title = (tocItem.title || '').trim();
                if (!title) continue;
                
                // Try case-insensitive search
                const lowerFullText = fullText.toLowerCase();
                const lowerTitle = title.toLowerCase();
                
                let idx = lowerFullText.indexOf(lowerTitle, lastIdx);
                
                if (idx !== -1) {
                    if (chapters.length > 0) {
                        chapters[chapters.length - 1].content = cleanGarbageText(fullText.substring(lastIdx, idx).trim());
                    }
                    chapters.push({ index: i, title: title, content: '' });
                    lastIdx = idx + title.length;
                }
            }
            if (chapters.length > 0) {
                chapters[chapters.length - 1].content = cleanGarbageText(fullText.substring(lastIdx).trim());
                // Filter out empty ones just in case
                const finalChapters = chapters.filter(c => c.content.length > 0);
                if (finalChapters.length > 0) return finalChapters;
            }
        }
        
        // Fallback: If TOC parsing failed or yielded no chapters, fallback to Flow-based logic
        const fallbackChapters = [];
        for (let i = 0; i < epub.flow.length; i++) {
             try {
                 const text = await epub.getChapter(epub.flow[i].id);
                 let plainText = convert(text || '', { 
                     wordwrap: false, 
                     selectors: [
                        { selector: 'img', format: 'skip' },
                        { selector: 'a', options: { ignoreHref: true } }
                     ] 
                 });
                 plainText = cleanGarbageText(plainText);
                 if (plainText.length > 0) {
                     fallbackChapters.push({ index: i, title: epub.flow[i].title || `Chương ${i + 1}`, content: plainText });
                 }
             } catch(e) {}
        }
        return fallbackChapters;

    } catch (err) {
        console.error("Lỗi khi parse epub:", err);
        throw err;
    }
}

// Ensure uploads/pdfs directory exists
const pdfUploadsDir = path.join(__dirname, '../../uploads/pdfs');
if (!fs.existsSync(pdfUploadsDir)) {
  fs.mkdirSync(pdfUploadsDir, { recursive: true });
}

// Configure multer for PDF upload
const upload = multer({ dest: 'uploads/pdfs/' });

router.post('/pdf-chapter', upload.single('pdf'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Không tìm thấy file PDF được tải lên.' });
    }

    const comicId = req.body.comicId;
    let title = req.body.title || 'Chương PDF';
    let chapterNumber = parseInt(req.body.chapterNumber);

    let actualComicId = comicId;
    let actualComicSlug = '';
    const isNewComic = req.body.isNewComic === 'true';

    if (isNewComic) {
      const newTitle = req.body.newComicTitle || 'Truyện Mới';
      const newAuthor = req.body.newComicAuthor || 'Chưa rõ';
      const newDescription = req.body.newComicDescription || '';
      
      // Generate a basic slug
      actualComicSlug = newTitle.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');
      if (!actualComicSlug) actualComicSlug = `comic-${Date.now()}`;
      
      // Ensure unique slug
      let slugSuffix = 0;
      let checkSlug = actualComicSlug;
      while (db.prepare('SELECT id FROM comics WHERE slug = ?').get(checkSlug)) {
        slugSuffix++;
        checkSlug = `${actualComicSlug}-${slugSuffix}`;
      }
      actualComicSlug = checkSlug;
      
      actualComicId = crypto.randomUUID();
      db.prepare('INSERT INTO comics (id, title, description, author, status, views, genreIds, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
        .run(
          actualComicId, 
          (newTitle || '').normalize('NFC'), 
          (newDescription || '').normalize('NFC'), 
          (newAuthor || '').normalize('NFC'), 
          'Ongoing', 
          0, 
          '[]', 
          actualComicSlug
        );
        
    } else {
      if (!comicId) {
        return res.status(400).json({ error: 'comicId là bắt buộc.' });
      }

      // Verify comic exists
      const comic = db.prepare('SELECT * FROM comics WHERE id = ?').get(comicId);
      if (!comic) {
        return res.status(404).json({ error: 'Không tìm thấy truyện.' });
      }
      actualComicSlug = comic.slug;
    }

    // Determine chapter number if not provided
    if (isNaN(chapterNumber)) {
      const maxChapter = db.prepare('SELECT MAX(chapterNumber) as maxNum FROM chapters WHERE comicId = ?').get(actualComicId);
      chapterNumber = (maxChapter.maxNum || 0) + 1;
    }

    const isEpub = req.file.originalname.toLowerCase().endsWith('.epub');
    let finalChapters = [];

    if (isEpub) {
        finalChapters = await parseEpubFile(req.file.path);
        if (finalChapters.length === 0) {
            return res.status(400).json({ error: 'Không thể trích xuất văn bản từ file EPUB này.' });
        }
    } else {
        const dataBuffer = fs.readFileSync(req.file.path);
        const pdfData = await pdfParse(dataBuffer);
        
        // Format text
        let rawText = pdfData.text.replace(/\r\n/g, '\n');
        if (!rawText.trim()) {
            return res.status(400).json({ error: 'Không thể trích xuất văn bản từ file PDF này.' });
        }
        
        const lines = rawText.split('\n');
        const chaptersToInsert = [];
        let currentChapter = { title: title || 'Giới thiệu', content: [] };
        chaptersToInsert.push(currentChapter);

        const chapterRegex = /^\s*(Chương|Phần|Bài|Chapter)\s+([0-9]+|[IVXLCDM]+)(?:[\:\.\-\s]+(.*))?$/i;

        for (let line of lines) {
            const match = line.match(chapterRegex);
            if (match) {
                const type = match[1];
                const num = match[2];
                const rest = match[3] ? match[3].trim() : '';
                const chapTitle = `${type} ${num}` + (rest ? `: ${rest}` : '');
                
                currentChapter = { title: chapTitle, content: [] };
                chaptersToInsert.push(currentChapter);
            } else {
                currentChapter.content.push(line);
            }
        }

        // Process and filter chunks
        chaptersToInsert.forEach(c => {
            c.content = cleanGarbageText(c.content.join('\n'));
        });
        
        // Remove chunks that are empty, but if the first chunk is 'Giới thiệu' and empty, just drop it.
        finalChapters = chaptersToInsert.filter(c => c.content.length > 0);
        if (finalChapters.length === 0) {
            // Fallback if somehow everything is empty
            finalChapters = [{ title: title || 'Chương PDF', content: cleanGarbageText(rawText) }];
        }
    }

    const { aiRevise } = req.body;
    
    // AI Revision Loop
    if (aiRevise === 'true' && process.env.GEMINI_API_KEY) {
        for (let i = 0; i < finalChapters.length; i++) {
            const chap = finalChapters[i];
            const prompt = `Bạn là một biên tập viên chuyên nghiệp. Dưới đây là nội dung một chương truyện. Hãy:
1. Sửa các lỗi chính tả nếu có.
2. Sửa các đoạn xuống dòng bị lỗi, căn lề, format cho văn bản trôi chảy và đẹp mắt.
3. Xóa mọi ký tự rác, watermark, link quảng cáo (vd: thuviensach.vn, tải sách miễn phí, v.v) nếu vẫn còn sót lại.
4. TUYỆT ĐỐI giữ nguyên cốt truyện, văn phong và toàn bộ nội dung. KHÔNG tóm tắt.
5. Chỉ trả về văn bản đã sửa, không thêm bất kỳ bình luận nào khác.

Nội dung:
${chap.content}`;
            try {
                const response = await genAI.models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: prompt,
                });
                if (response.text) {
                    chap.content = response.text;
                }
                // Ngủ 4 giây để tránh rate limit (15 req/min = 1 req/4s)
                if (i < finalChapters.length - 1) {
                    await sleep(4000);
                }
            } catch (err) {
                console.error(`Lỗi AI revise chương ${chap.title}:`, err);
            }
        }
    }

    let currentChapNum = chapterNumber;
    let firstChapter = null;

    const insertStmt = db.prepare('INSERT INTO chapters (id, comicId, chapterNumber, title, content, slug) VALUES (?, ?, ?, ?, ?, ?)');
    
    const insertMany = db.transaction((chaps) => {
        for (let chap of chaps) {
            const normChapTitle = chap.title.normalize('NFC');
            const normChapContent = chap.content.normalize('NFC');
            
            let slug = `chuong-${currentChapNum}`;
            let finalSlug = slug;
            let existingChapter = db.prepare('SELECT id FROM chapters WHERE comicId = ? AND slug = ?').get(actualComicId, slug);
            if (existingChapter) {
                finalSlug = `${slug}-${Date.now()}`;
            }

            const chapId = crypto.randomUUID();
            insertStmt.run(chapId, actualComicId, currentChapNum, normChapTitle, normChapContent, finalSlug);
            
            if (!firstChapter) {
                firstChapter = {
                    id: chapId,
                    chapterNumber: currentChapNum,
                    title: normChapTitle,
                    slug: finalSlug
                };
            }
            currentChapNum++;
        }
    });

    insertMany(finalChapters);

    // Clean up uploaded file
    fs.unlinkSync(req.file.path);

    res.json({
        message: `Tạo thành công ${finalChapters.length} chương từ PDF`,
        comicSlug: actualComicSlug,
        chapter: firstChapter,
        totalChaptersAdded: finalChapters.length
    });

  } catch (err) {
    console.error('Lỗi khi xử lý file PDF:', err);
    // Cleanup on error
    if (req.file && fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
    }
    res.status(500).json({ error: 'Đã có lỗi xảy ra khi xử lý file PDF.' });
  }
});

module.exports = router;
