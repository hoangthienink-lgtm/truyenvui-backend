const axios = require('axios');
const cheerio = require('cheerio');
const crypto = require('crypto');
const db = require('../config/db');

const headers = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7'
};

async function crawlNovelAndChapters(startUrl, crawlNextCount = 1) {
  let cleanUrl = startUrl.replace(/\/$/, ""); // remove trailing slash
  const parts = cleanUrl.split('/');
  const lastPart = parts[parts.length - 1];
  
  let baseNovelUrl = cleanUrl;
  let initialChapterSlug = "";
  
  if (lastPart.startsWith('chuong-') || /^\d+$/.test(lastPart)) {
    initialChapterSlug = lastPart;
    parts.pop();
    baseNovelUrl = parts.join('/') + '/';
  } else {
    baseNovelUrl = cleanUrl + '/';
  }

  let truyenTitle = '';
  let author = 'Chưa rõ';
  let coverImageUrl = '';
  const genreIds = [];
  let status = 'Ongoing';
  let description = '';
  const comicSlug = baseNovelUrl.split('/').filter(Boolean).pop(); // "kiem-vuc-vo-dich"

  // 1. Fetch novel meta info
  try {
    const novelRes = await axios.get(baseNovelUrl, { headers });
    const $$ = cheerio.load(novelRes.data);
    
    truyenTitle = $$('h1[itemprop="name"]').text().trim() || $$('.title').first().text().trim() || $$('h3.title').text().trim();
    
    $$('.info > div, .book-info-text li').each((i, el) => {
      const text = $$(el).text().trim();
      if (text.includes('Tác giả:') || text.includes('Tác giả :')) {
        author = $$(el).find('a').text().trim() || text.replace(/Tác giả\s*:/, '').trim();
      } else if (text.includes('Thể loại:') || text.includes('Thể loại :')) {
        $$(el).find('a').each((j, aEl) => {
          const gName = $$(aEl).text().trim();
          const gSlug = ($$(aEl).attr('href') || '').split('/').filter(Boolean).pop() || '';
          if (gName && gSlug) {
            genreIds.push(gSlug);
            
            // Check & insert genre
            const existingGenre = db.prepare('SELECT * FROM genres WHERE id = ?').get(gSlug);
            if (!existingGenre) {
              db.prepare('INSERT INTO genres (id, name, slug) VALUES (?, ?, ?)')
                .run(gSlug, gName, gSlug);
            }
          }
        });
      } else if (text.includes('Trạng thái:')) {
        const statusText = $$(el).find('.text-primary, .text-success, .label-status').text().trim() || text.replace('Trạng thái:', '').trim();
        status = statusText.toLowerCase().includes('hoàn') || statusText.toLowerCase().includes('full') ? 'Completed' : 'Ongoing';
      }
    });

    let coverSrc = $$('.info-holder .book img').attr('src') || $$('.books .book img').attr('src') || $$('img[itemprop="image"]').attr('src') || '';
    if (coverSrc && coverSrc.startsWith('/')) {
      const urlObj = new URL(baseNovelUrl);
      coverImageUrl = urlObj.origin + coverSrc;
    } else {
      coverImageUrl = coverSrc;
    }

    description = $$('.desc-text').text().trim() || $$('.desc-text-full').text().trim() || $$('.intro').text().trim() || $$('#gioithieu .scrolltext').text().trim() || '';

  } catch (novelErr) {
    console.warn('Could not fetch main novel page, using defaults:', novelErr.message);
  }

  if (!truyenTitle) {
    truyenTitle = comicSlug.split('-').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
  }

  // Composed NFC Normalize
  const normTitle = truyenTitle.normalize('NFC');
  const normDesc = (description || 'Truyện được crawl tự động từ TruyenFull').normalize('NFC');
  const normAuthor = author.normalize('NFC');
  const normStatus = status.normalize('NFC');

  // Insert or update novel in DB
  let comic = db.prepare('SELECT * FROM comics WHERE slug = ?').get(comicSlug);
  let comicId;
  if (!comic) {
    comicId = crypto.randomUUID();
    db.prepare('INSERT INTO comics (id, title, description, coverImageUrl, author, status, views, genreIds, slug) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .run(comicId, normTitle, normDesc, coverImageUrl, normAuthor, normStatus, 0, JSON.stringify(genreIds), comicSlug);
  } else {
    comicId = comic.id;
    db.prepare('UPDATE comics SET title = ?, description = ?, coverImageUrl = ?, author = ?, status = ?, genreIds = ? WHERE id = ?')
      .run(normTitle, normDesc, coverImageUrl || comic.coverImageUrl, normAuthor, normStatus, JSON.stringify(genreIds), comicId);
  }

  // 2. Fetch Chapters sequentially
  let currentUrl = startUrl;
  let chaptersCrawled = [];

  for (let i = 0; i < crawlNextCount; i++) {
    if (!currentUrl || currentUrl.includes('javascript:void(0)')) break;

    let response;
    try {
      response = await axios.get(currentUrl, { headers });
    } catch (err) {
      console.warn(`Could not fetch chapter ${currentUrl}:`, err.message);
      break;
    }
    const $ = cheerio.load(response.data);
    
    const chapterTitleFull = $('.chapter-title').text().trim() || $('h2').text().trim();
    const chapterTitle = chapterTitleFull.replace(/Chương \d+:\s*/i, '').replace(truyenTitle + ' - ', '').trim();
    
    const chapterSlug = currentUrl.split('/').filter(Boolean).pop(); // "chuong-1"
    const numMatch = chapterSlug.match(/chuong-(\d+)/);
    const chapterNumber = numMatch ? parseInt(numMatch[1], 10) : (i + 1);

    // Extract chapter content paragraphs
    const $chapWrapper = $('#chapter-c').length > 0 ? $('#chapter-c') : $('.truyen');
    $chapWrapper.find('script, iframe, .ads-unlock-container, .ads-unlock-reminder').remove();
    
    let content = '';
    $chapWrapper.contents().each((index, element) => {
      if (element.type === 'text') {
        content += $(element).text().trim() + '\n\n';
      } else if (element.name === 'p') {
        content += $(element).text().trim() + '\n\n';
      } else if (element.name === 'br') {
        content += '\n';
      }
    });
    content = content.replace(/\n{3,}/g, '\n\n').trim();

    if (!content || content.length < 50) {
      content = $chapWrapper.text().replace(/\s+/g, ' ').replace(/Click quảng cáo/g, '').trim();
    }

    // Composed NFC Normalize
    const normChapTitle = chapterTitle.normalize('NFC');
    const normChapContent = content.normalize('NFC');

    // Save chapter
    const existingChapter = db.prepare('SELECT * FROM chapters WHERE comicId = ? AND slug = ?').get(comicId, chapterSlug);
    if (existingChapter) {
      db.prepare('UPDATE chapters SET title = ?, content = ?, chapterNumber = ? WHERE id = ?')
        .run(normChapTitle, normChapContent, chapterNumber, existingChapter.id);
    } else {
      db.prepare('INSERT INTO chapters (id, comicId, chapterNumber, title, content, slug) VALUES (?, ?, ?, ?, ?, ?)')
        .run(crypto.randomUUID(), comicId, chapterNumber, normChapTitle, normChapContent, chapterSlug);
    }

    chaptersCrawled.push({ chapterNumber, title: normChapTitle, slug: chapterSlug });

    // Next chapter link
    let nextHref = $('#next_chap').attr('href') || $('.chapter_control a.next').attr('href');
    if (nextHref && nextHref !== currentUrl && nextHref !== 'javascript:void(0);' && nextHref !== '#') {
      if (nextHref.startsWith('/')) {
        const urlObj = new URL(currentUrl);
        currentUrl = urlObj.origin + nextHref;
      } else {
        currentUrl = nextHref;
      }
    } else {
      currentUrl = null;
    }
  }

  return { comicSlug, chapters: chaptersCrawled };
}

module.exports = {
  crawlNovelAndChapters
};
