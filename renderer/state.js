export const state = {
  activeView: 'ingestion',
  queue: [],
  selectedId: null,
  records: [],
  pagination: {
    page: 1,
    limit: 10,
    total: 0
  }
};

export const fields = {
  first_name: 'field-first-name',
  last_name: 'field-last-name',
  doc_number: 'field-id-number',
  doc_type: 'field-doc-type',
  expiry_date: 'field-expiry-date',
  phone_number: 'field-phone-number'
};
