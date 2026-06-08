import type { OcrResponse } from './types';

/**
 * Heuristics-based parser to extract identity fields from raw OCR text blocks.
 */
export function parseOcrText(text: string, defaultDocType: string = 'Image Document'): OcrResponse['data'] {
  const lines = text.split('\n').map(line => line.trim()).filter(Boolean);
  
  let firstName = '';
  let lastName = '';
  let phoneNumber = '';
  let docType = defaultDocType;
  let docNumber = '';
  let expiryDate = '';
  let confidenceScore = 50; // Starting baseline
  const notesList: string[] = [];

  const textUpper = text.toUpperCase();

  // 1. Check for MRZ (Machine Readable Zone) - typically found in passports
  const passportMrzLines = lines.filter(l => l.includes('<') && l.replace(/\s/g, '').length >= 40);
  
  if (passportMrzLines.length >= 2) {
    notesList.push('Parsed Passport MRZ.');
    docType = 'Passport';
    confidenceScore = 90;
    
    const line1 = passportMrzLines[0].replace(/\s/g, '').toUpperCase();
    const line2 = passportMrzLines[1].replace(/\s/g, '').toUpperCase();
    
    // Parse Line 2
    // Passport Number: characters 0 to 9
    const rawPassportNum = line2.slice(0, 9).replace(/</g, '');
    docNumber = rawPassportNum;
    
    // Expiry Date: characters 21 to 27 (YYMMDD format)
    const rawExpiry = line2.slice(21, 27);
    if (/^\d{6}$/.test(rawExpiry)) {
      const yearPrefix = parseInt(rawExpiry.slice(0, 2)) < 50 ? '20' : '19';
      expiryDate = `${yearPrefix}${rawExpiry.slice(0, 2)}-${rawExpiry.slice(2, 4)}-${rawExpiry.slice(4, 6)}`;
    }
    
    // Parse Line 1 for Name: Format is P<DTO[LAST_NAME]<<[FIRST_NAME]...
    const namePart = line1.slice(5); // Skip P<CountryCode
    const nameParts = namePart.split('<<').map(p => p.replace(/</g, ' ').trim());
    if (nameParts.length >= 2) {
      lastName = nameParts[0].split(' ')[0] || '';
      firstName = nameParts[1].split(' ')[0] || '';
    } else if (nameParts.length === 1) {
      firstName = nameParts[0].split(' ')[0] || '';
    }
  }

  // 2. If not parsed by MRZ, use standard Regex heuristics
  
  // -- Emirates ID detection --
  const eidRegex = /(?:784)[- ]?\d{4}[- ]?\d{7}[- ]?\d{1}/;
  const eidMatch = text.match(eidRegex);
  if (eidMatch) {
    docType = 'Emirates ID';
    confidenceScore = Math.max(confidenceScore, 85);
    // Format EID standardly: 784-YYYY-XXXXXXX-Z
    const digits = eidMatch[0].replace(/[- ]/g, '');
    docNumber = `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 14)}-${digits.slice(14)}`;
    notesList.push('Detected Emirates ID number.');
  }

  // -- Passport detection (non-MRZ) --
  if (docType !== 'Emirates ID' && docType !== 'Passport') {
    if (textUpper.includes('PASSPORT') || textUpper.includes('PASAPORTE')) {
      docType = 'Passport';
      confidenceScore = Math.max(confidenceScore, 70);
    }
  }

  // -- Visa detection --
  if (docType === defaultDocType) {
    if (textUpper.includes('VISA') || textUpper.includes('ENTRY PERMIT') || textUpper.includes('RESIDENCE')) {
      docType = 'Visa';
      confidenceScore = Math.max(confidenceScore, 65);
    }
  }

  // -- Labor Card detection --
  if (docType === defaultDocType) {
    if (textUpper.includes('LABOUR') || textUpper.includes('LABOR') || textUpper.includes('WORK PERMIT') || textUpper.includes('EMPLOYMENT CARD')) {
      docType = 'Labor Card';
      confidenceScore = Math.max(confidenceScore, 65);
    }
  }

  // -- Document Number heuristics (if not EID or MRZ-parsed passport) --
  if (!docNumber) {
    if (docType === 'Passport') {
      const passNumRegex = /\b[A-Z]\d{7,8}\b/i;
      const passMatch = text.match(passNumRegex);
      if (passMatch) {
        docNumber = passMatch[0].toUpperCase();
        confidenceScore = Math.max(confidenceScore, 80);
      }
    } else if (docType === 'Visa') {
      const visaRegex = /\b201[- /]?\d{4}[- /]?\d{7,8}\b/;
      const visaMatch = text.match(visaRegex);
      if (visaMatch) {
        docNumber = visaMatch[0].replace(/\s/g, '');
        confidenceScore = Math.max(confidenceScore, 80);
      }
    }
  }

  // -- Phone number extraction --
  // UAE mobile number pattern: +971-5X-XXXXXXX or 05X-XXXXXXX (allows spaces/dashes in between)
  const phoneRegex = /(?:\+971|00971|0)?[- ]?5[024568](?:[- ]?\d){7}\b/;
  const phoneMatch = text.match(phoneRegex);
  if (phoneMatch) {
    let rawPhone = phoneMatch[0].replace(/[- ]/g, '');
    if (rawPhone.startsWith('05')) {
      phoneNumber = `+971${rawPhone.slice(1)}`;
    } else if (rawPhone.startsWith('5')) {
      phoneNumber = `+971${rawPhone}`;
    } else if (rawPhone.startsWith('00971')) {
      phoneNumber = `+971${rawPhone.slice(5)}`;
    } else {
      phoneNumber = rawPhone;
    }
  }

  // -- Date Expiry Extraction (if not MRZ-parsed) --
  if (!expiryDate) {
    const dateRegex = /\b(?:\d{4}[-/]\d{2}[-/]\d{2}|\d{2}[-/]\d{2}[-/]\d{4})\b/g;
    const matches = text.match(dateRegex) || [];
    
    const textDatesRegex = /\b\d{1,2}[- ](?:JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)[a-z]*[- ]\d{4}\b/gi;
    const textMatches = text.match(textDatesRegex) || [];

    const allDates: Date[] = [];
    
    const addParsedDate = (dateStr: string) => {
      const cleanStr = dateStr.replace(/\//g, '-');
      let d: Date | null = null;
      if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
        d = new Date(cleanStr);
      } else if (/^\d{2}-\d{2}-\d{4}$/.test(cleanStr)) {
        const parts = cleanStr.split('-');
        d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
      }
      if (d && !isNaN(d.getTime())) {
        allDates.push(d);
      }
    };

    matches.forEach(addParsedDate);

    textMatches.forEach(str => {
      const parts = str.split(/[- ]+/);
      if (parts.length === 3) {
        const day = parts[0];
        const monthStr = parts[1].substring(0, 3).toUpperCase();
        const year = parts[2];
        const months = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
        const monthIndex = months.indexOf(monthStr);
        if (monthIndex !== -1) {
          const month = String(monthIndex + 1).padStart(2, '0');
          const d = new Date(`${year}-${month}-${day.padStart(2, '0')}`);
          if (!isNaN(d.getTime())) {
            allDates.push(d);
          }
        }
      }
    });

    const futureDates = allDates.filter(d => d.getTime() > new Date('2026-01-01').getTime());
    if (futureDates.length > 0) {
      futureDates.sort((a, b) => a.getTime() - b.getTime());
      
      let foundExpiryDate = false;
      const expiryKeywords = ['EXPIRY', 'EXP', 'VALID UNTIL', 'DATE OF EXPIRY', 'VALIDEZ'];
      
      for (const line of lines) {
        const lineUpper = line.toUpperCase();
        if (expiryKeywords.some(kw => lineUpper.includes(kw))) {
          const lineMatch = line.match(dateRegex) || line.match(textDatesRegex);
          if (lineMatch && lineMatch.length > 0) {
            const tempDates: Date[] = [];
            lineMatch.forEach(dateStr => {
              const cleanStr = dateStr.replace(/\//g, '-');
              let d: Date | null = null;
              if (/^\d{4}-\d{2}-\d{2}$/.test(cleanStr)) {
                d = new Date(cleanStr);
              } else if (/^\d{2}-\d{2}-\d{4}$/.test(cleanStr)) {
                const parts = cleanStr.split('-');
                d = new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
              }
              if (d && !isNaN(d.getTime())) tempDates.push(d);
            });
            if (tempDates.length > 0) {
              const iso = tempDates[0].toISOString().split('T')[0];
              expiryDate = iso;
              foundExpiryDate = true;
              notesList.push('Extracted expiry date near keyword.');
              break;
            }
          }
        }
      }

      if (!foundExpiryDate && futureDates.length > 0) {
        const latestFuture = futureDates[futureDates.length - 1];
        expiryDate = latestFuture.toISOString().split('T')[0];
        notesList.push('Guessed expiry date from future date list.');
      }
    }
  }

  // -- Name heuristics (non-MRZ) --
  if (!firstName && !lastName) {
    for (let i = 0; i < lines.length; i++) {
      const lineUpper = lines[i].toUpperCase();
      if (lineUpper.includes('SURNAME') || lineUpper.includes('FAMILY NAME')) {
        const parts = lines[i].split(':');
        if (parts.length > 1 && parts[1].trim()) {
          lastName = parts[1].trim();
        } else if (i + 1 < lines.length) {
          lastName = lines[i+1].trim();
        }
      }
      if (lineUpper.includes('GIVEN NAME') || lineUpper.includes('FORENAMES')) {
        const parts = lines[i].split(':');
        if (parts.length > 1 && parts[1].trim()) {
          firstName = parts[1].trim();
        } else if (i + 1 < lines.length) {
          firstName = lines[i+1].trim();
        }
      }
    }
    
    if (docType === 'Emirates ID') {
      const nameIndex = lines.findIndex(l => l.toUpperCase().includes('NAME') && !l.toUpperCase().includes('FATHER'));
      if (nameIndex !== -1) {
        const line = lines[nameIndex];
        const parts = line.split(':');
        let rawName = '';
        if (parts.length > 1 && parts[1].trim()) {
          rawName = parts[1].trim();
        } else if (nameIndex + 1 < lines.length) {
          rawName = lines[nameIndex + 1].trim();
        }
        
        if (rawName) {
          const nameParts = rawName.split(/\s+/);
          if (nameParts.length >= 2) {
            firstName = nameParts[0];
            lastName = nameParts.slice(1).join(' ');
          } else {
            firstName = rawName;
          }
        }
      }
    }
  }

  const capitalize = (s: string) => s.split(' ').map(w => w.charAt(0).toUpperCase() + w.substring(1).toLowerCase()).join(' ');
  if (firstName) firstName = capitalize(firstName);
  if (lastName) lastName = capitalize(lastName);

  if (docNumber && expiryDate) {
    confidenceScore = Math.min(confidenceScore + 15, 95);
  }

  const finalNotes = notesList.length > 0 
    ? `Mobile OCR extraction: ${notesList.join(' ')}` 
    : 'Mobile OCR completed with fallback heuristics.';

  return {
    firstName: firstName || '',
    lastName: lastName || '',
    phoneNumber: phoneNumber || '',
    docType,
    docNumber: docNumber || '',
    expiryDate: expiryDate || '',
    confidenceScore,
    notes: finalNotes
  };
}
