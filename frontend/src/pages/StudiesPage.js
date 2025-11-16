import React, { useEffect, useState, useCallback } from 'react';
import { searchStudies, getPACSBase } from '../services/dicomService';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/UI/LoadingSpinner';
import { usePageContext } from '../contexts/PageContext';
import { resolveBlueLightStartUrl } from '../utils/bluelight';
import { Search, Filter, Calendar, User, Hash, Settings, X, ChevronDown } from 'lucide-react';

const modalityOptions = [
  { label: 'CT', value: 'CT' },
  { label: 'US', value: 'US' },
  { label: 'MR', value: 'MR' },
  { label: 'OT', value: 'OT' },
  { label: 'CR', value: 'CR' }
];

const getTagValue = (ds, tag, path = []) => {
  const el = ds?.[tag];
  if (!el) return '';
  const val = el.Value;
  if (!val) return '';
  if (Array.isArray(val)) {
    if (typeof val[0] === 'object' && val[0] !== null && path.length) {
      return path.reduce((acc, key) => (acc && acc[key] != null ? acc[key] : ''), val[0]) || '';
    }
    return String(val[0]);
  }
  return String(val);
};

const formatDA = (da) => {
  if (!da) return '';
  const s = String(da);
  if (s.length === 8) {
    return `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}`;
  }
  return s;
};

const StudiesPage = () => {
  const { setPageTitle, setPageDescription } = usePageContext();
  const [loading, setLoading] = useState(false);
  const [items, setItems] = useState([]);
  const [pacsBase, setPacsBase] = useState({ pacs_url: '', studies_base: '' });
  const [openDownloadFor, setOpenDownloadFor] = useState(null);
  const [pagination, setPagination] = useState({ limit: 10, offset: 0 });

  const [filters, setFilters] = useState({
    patientName: '',
    studyDate: ''
  });
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [adv, setAdv] = useState({ patientId: '', accessionNumber: '', startDate: '', endDate: '', tag: '' });

  // Modality chips + custom input
  const [selectedModalities, setSelectedModalities] = useState([]);
  const [modalityInput, setModalityInput] = useState('');

  const toggleModality = useCallback((code) => {
    setSelectedModalities((prev) => prev.includes(code)
      ? prev.filter((m) => m !== code)
      : [...prev, code]
    );
  }, []);

  const fetchData = async (opts = {}) => {
    setLoading(true);
    try {
      const params = { ...filters, limit: pagination.limit, offset: pagination.offset, ...opts };
      // Clean studyDate format: allow user input like yyyy/mm/dd - yyyy/mm/dd
      if (params.studyDate) {
        params.studyDate = params.studyDate.replace(/[\s]/g, '').replace(/[\/]/g, '');
      }
      // Merge advanced filters
      if (adv.patientId) params.patientId = adv.patientId;
      if (adv.accessionNumber) params.accessionNumber = adv.accessionNumber;
      if (adv.tag) params.studyDescription = adv.tag;
      if (adv.startDate || adv.endDate) {
        const toDA = (d) => d.replace(/[\s/\-]/g, '');
        params.studyDate = `${adv.startDate ? toDA(adv.startDate) : ''}-${adv.endDate ? toDA(adv.endDate) : ''}`;
      }
      if (selectedModalities.length > 0) {
        params.modalities = selectedModalities.join(',');
      }
      const res = await searchStudies(params);
      setItems(res.items || []);
    } catch (e) {
      toast.error('Failed to load studies');
    } finally {
      setLoading(false);
    }
  };

  const downloadStudy = async (uid, format, baseName) => {
    try {
      const params = new URLSearchParams();
      if (format !== 'zip') params.set('format', format);
      if (baseName) params.set('filename', baseName);
      const query = params.toString();
      const requestUrl = `/api/dicom/studies/${encodeURIComponent(uid)}/download${query ? `?${query}` : ''}`;
      const acceptHeader = format === 'png' ? 'image/png' : format === 'dcm' ? 'application/dicom' : 'application/zip';
      const resp = await fetch(requestUrl, {
        headers: {
          Accept: acceptHeader
        }
      });
      if (!resp.ok) throw new Error('Download failed');
      const disposition = resp.headers.get('Content-Disposition');
      let filename;
      if (disposition) {
        const match = /filename\*?=([^;]+)/i.exec(disposition);
        if (match && match[1]) {
          filename = decodeURIComponent(match[1].replace(/UTF-8''/i, '').trim().replace(/^"|"$/g, ''));
        }
      }
      const blob = await resp.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      if (filename) {
        link.download = filename;
      } else {
        const safeBase = baseName ? baseName.replace(/[^A-Za-z0-9_.-]+/g, '_') : `study-${uid}`;
        const suffix = format === 'png' ? '.png' : format === 'dcm' ? '.dcm' : '.zip';
        link.download = `${safeBase}${suffix}`;
      }
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      toast.error('Download failed');
    }
  };

  useEffect(() => {
    // Set page title and description
    setPageTitle('DICOM Studies');
    setPageDescription('Search DICOM studies using filters');
    // Load PACS base and initial data
    (async () => {
      try {
        const base = await getPACSBase();
        setPacsBase(base || { pacs_url: '', studies_base: '' });
      } catch (_) {
        // ignore; fallback will be used
      } finally {
        fetchData();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setPageTitle, setPageDescription]);

  const onChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((p) => ({ ...p, offset: 0 }));
  };

  const handleReset = () => {
    setFilters({ patientId: '', patientName: '', studyUID: '', accessionNumber: '', studyDate: '' });
    setSelectedModalities([]);
    setModalityInput('');
    setPagination({ limit: 10, offset: 0 });
  };

  const handlePage = (dir) => {
    setPagination((p) => {
      const next = Math.max(0, p.offset + dir * p.limit);
      fetchData({ offset: next });
      return { ...p, offset: next };
    });
  };

  const blueLightStartUrl =
    resolveBlueLightStartUrl() ||
    (typeof window !== 'undefined'
      ? `${window.location.protocol}//${window.location.host}/bluelight/html/start.html`
      : 'http://localhost/bluelight/html/start.html');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter Panel */}
      <div className="flex-shrink-0 bg-white border border-gray-200 rounded-lg p-4 mb-3">
        
        <div className="space-y-4">
          {/* Modality Filter */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 flex items-center">
              <Settings className="h-4 w-4 mr-2 text-gray-500" />
              Modality
            </label>
            
            <div className="space-y-3">
              <div className="flex flex-wrap gap-2">
                {modalityOptions.map((m) => (
                  <button
                    type="button"
                    key={m.value}
                    className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                      selectedModalities.includes(m.value) 
                        ? 'bg-blue-100 text-blue-800 border border-blue-200 shadow-sm' 
                        : 'bg-gray-100 text-gray-700 border border-gray-200 hover:bg-gray-200'
                    }`}
                    onClick={() => toggleModality(m.value)}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              
              <input
                className="block w-full px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                placeholder="Enter custom modalities (e.g., CT,MR,XA)"
                value={modalityInput}
                onChange={(e) => setModalityInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    const tokens = modalityInput.split(',').map((t) => t.trim()).filter(Boolean);
                    if (tokens.length) {
                      setSelectedModalities((prev) => Array.from(new Set([...prev, ...tokens])));
                      setModalityInput('');
                    }
                  }
                }}
              />
              
              {selectedModalities.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedModalities.map((m) => (
                    <span 
                      key={m} 
                      className="inline-flex items-center px-2 py-1 rounded-md text-sm bg-blue-50 text-blue-700 border border-blue-200 cursor-pointer hover:bg-blue-100 transition-colors" 
                      onClick={() => toggleModality(m)}
                      title="Click to remove"
                    >
                      {m}
                      <X className="h-4 w-4 ml-1" />
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Patient Name Filter */}
          <div className="space-y-3">
            <label className="text-sm font-medium text-gray-700 flex items-center">
              <User className="h-4 w-4 mr-2 text-gray-500" />
              Patient Name
            </label>
            
            <div className="flex gap-3">
              <input 
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm placeholder-gray-500 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                name="patientName" 
                value={filters.patientName} 
                onChange={onChange} 
                placeholder="Search by patient name (partial match supported)..." 
              />
              <button 
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm"
                onClick={() => { 
                  setPagination((p)=>({...p, offset:0})); 
                  fetchData({ offset:0 }); 
                }}
              >
                <Search className="h-4 w-4 mr-1" />
                Search
              </button>
              <button 
                className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
                onClick={() => setShowAdvanced(true)}
              >
                <Filter className="h-4 w-4 mr-1" />
                Advanced
              </button>
            </div>
          </div>
        </div>
      </div>

      {showAdvanced && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b border-gray-200 px-6 py-4 rounded-t-xl">
              <div className="flex items-center justify-between">
                <h3 className="text-xl font-semibold text-gray-900">Advanced Search</h3>
                <button
                  onClick={() => setShowAdvanced(false)}
                  className="p-2 hover:bg-gray-100 rounded-full transition-colors"
                >
                  <X className="h-5 w-5 text-gray-500" />
                </button>
              </div>
            </div>
            
            <div className="px-6 py-6">
              <div className="space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Patient ID
                    </label>
                    <input 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                      placeholder="Enter patient ID"
                      value={adv.patientId} 
                      onChange={(e)=>setAdv(prev=>({...prev, patientId:e.target.value}))} 
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="block text-sm font-medium text-gray-700">
                      Accession Number
                    </label>
                    <input 
                      className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                      placeholder="Enter accession number"
                      value={adv.accessionNumber} 
                      onChange={(e)=>setAdv(prev=>({...prev, accessionNumber:e.target.value}))} 
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="block text-sm font-medium text-gray-700">
                    Study Description
                  </label>
                  <input 
                    className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                    placeholder="Enter study description or keywords"
                    value={adv.tag} 
                    onChange={(e)=>setAdv(prev=>({...prev, tag:e.target.value}))} 
                  />
                </div>

                <div className="space-y-3">
                  <label className="block text-sm font-medium text-gray-700">
                    Date Range
                  </label>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <label className="block text-xs text-gray-500">From</label>
                      <input 
                        type="date" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                        value={adv.startDate} 
                        onChange={(e)=>setAdv(prev=>({...prev, startDate:e.target.value}))} 
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs text-gray-500">To</label>
                      <input 
                        type="date" 
                        className="w-full px-3 py-2 border border-gray-300 rounded-md shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors" 
                        value={adv.endDate} 
                        onChange={(e)=>setAdv(prev=>({...prev, endDate:e.target.value}))} 
                      />
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="sticky bottom-0 bg-gray-50 border-t border-gray-200 px-6 py-4 rounded-b-xl">
              <div className="flex items-center justify-end gap-3">
                <button 
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
                  onClick={()=>setShowAdvanced(false)}
                >
                  Cancel
                </button>
                <button 
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 border border-transparent rounded-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors shadow-sm"
                  onClick={()=>{ 
                    setShowAdvanced(false); 
                    setPagination((p)=>({...p, offset:0})); 
                    fetchData({ offset:0 }); 
                  }}
                >
                  Apply Filters
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Locked Studies Table Frame */}
      <div className="flex-1 bg-white rounded-lg overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex-1 flex items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : (
          <>
            {/* Table Content - Scrollable Area */}
            <div className="flex-1 min-h-0 overflow-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50 sticky top-0 z-10 border-b border-gray-200">
                  <tr>
                    <th className="px-2 py-2 text-left sticky left-0 z-20 bg-gray-50" style={{minWidth: '60px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Thumb</span>
                    </th>
                    <th className="px-2 py-2 text-left sticky left-[60px] z-20 bg-gray-50" style={{minWidth: '40px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">#</span>
                    </th>
                    <th className="px-2 py-2 text-left sticky left-[100px] z-20 bg-gray-50" style={{minWidth: '140px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Patient Name</span>
                    </th>
                    <th className="px-2 py-2 text-left" style={{minWidth: '110px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Patient ID</span>
                    </th>
                    <th className="px-2 py-2 text-left" style={{minWidth: '120px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Accession</span>
                    </th>
                    <th className="px-2 py-2 text-left" style={{minWidth: '60px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Gender</span>
                    </th>
                    <th className="px-2 py-2 text-left" style={{minWidth: '80px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Modality</span>
                    </th>
                    <th className="px-2 py-2 text-left" style={{minWidth: '90px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Study Date</span>
                    </th>
                    <th className="px-2 py-2 text-left" style={{minWidth: '160px'}}>
                      <span className="text-xs font-medium text-gray-600 uppercase">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {items.map((ds, idx) => {
                    const name = getTagValue(ds, '00100010', ['Alphabetic']);
                    const pid = getTagValue(ds, '00100020');
                    const uid = getTagValue(ds, '0020000D');
                    const mod = getTagValue(ds, '00080061');
                    const date = formatDA(getTagValue(ds, '00080020'));
                    const acc = getTagValue(ds, '00080050');
                  const gender = getTagValue(ds, '00100040');
                    const appOrigin = window.location.origin;
                    const viewerParams = new URLSearchParams({
                      StudyInstanceUID: uid || '',
                      PatientName: name || '',
                      PatientID: pid || ''
                    });
                    const viewerLink = `${appOrigin}/bluelight?${viewerParams.toString()}`;
                    const copyLink = `${blueLightStartUrl}?${viewerParams.toString()}`;
                  const studiesBase = pacsBase?.studies_base?.replace(/\/*$/,'') || '';
                  const tnUrl = uid ? `${studiesBase}/${encodeURIComponent(uid)}/thumbnail?viewport=32,32` : '';
                  const pacsLink = uid ? `${studiesBase}/${encodeURIComponent(uid)}` : '#';
                    const genderBoxClass = gender === 'F' ? 'bg-pink-100 text-pink-700' : gender === 'M' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-700';
                    const genderText = gender === 'F' ? 'F' : gender === 'M' ? 'M' : '?';
                    return (
                      <tr key={uid || idx} className="hover:bg-gray-50/50">
                        <td className="px-2 py-3 sticky left-0 bg-white hover:bg-gray-50/50" style={{minWidth: '60px'}}>
                          {tnUrl ? (
                            <img src={tnUrl} alt="tn" className="h-7 w-7 object-contain rounded" />
                          ) : (
                            <div className="h-7 w-7 bg-gray-200 rounded flex items-center justify-center text-xs text-gray-500">.dcm</div>
                          )}
                        </td>
                        <td className="px-2 py-3 sticky left-[60px] bg-white hover:bg-gray-50/50 text-gray-500 text-xs" style={{minWidth: '40px'}}>
                          {pagination.offset + idx + 1}
                        </td>
                        <td className="px-2 py-3 text-gray-900 sticky left-[100px] bg-white hover:bg-gray-50/50 font-medium text-sm" style={{minWidth: '140px'}}>
                          {name || '-'}
                        </td>
                        <td className="px-2 py-3 text-gray-700 text-sm" style={{minWidth: '110px'}}>{pid || '-'}</td>
                        <td className="px-2 py-3 text-gray-700 text-sm" style={{minWidth: '120px'}}>{acc || '-'}</td>
                        <td className="px-2 py-3" style={{minWidth: '60px'}}>
                          <span className={`inline-flex items-center justify-center h-5 w-5 text-xs font-medium rounded-full ${genderBoxClass}`}>
                            {genderText}
                          </span>
                        </td>
                        <td className="px-2 py-3 text-gray-700 text-sm" style={{minWidth: '80px'}}>{mod || '-'}</td>
                        <td className="px-2 py-3 text-gray-700 text-sm" style={{minWidth: '90px'}}>{date || '-'}</td>
                        <td className="px-2 py-3" style={{minWidth: '160px', position: 'relative'}}>
                          <div className="flex items-center gap-1">
                            <div className="relative inline-block text-left">
                              <button
                                type="button"
                                className="px-1.5 py-1 text-xs bg-gray-100 hover:bg-gray-200 text-gray-700 rounded inline-flex items-center gap-1"
                                onClick={() => setOpenDownloadFor((prev) => prev === uid ? null : uid)}
                                title="Download options"
                              >
                                Download
                                <span aria-hidden>▾</span>
                              </button>
                              {openDownloadFor === uid && (
                                <div className="origin-top-left absolute mt-1 w-32 rounded-md shadow-lg bg-white ring-1 ring-black ring-opacity-5 z-30">
                                  <div className="py-1 text-xs">
                                    <button
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700"
                                      onClick={async () => {
                                        setOpenDownloadFor(null);
                                        const rawName = name || pid || uid;
                                        await downloadStudy(uid, 'zip', rawName);
                                      }}
                                    >
                                      ZIP
                                    </button>
                                    <button
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700"
                                      onClick={async () => {
                                        setOpenDownloadFor(null);
                                        const rawName = name || pid || uid;
                                        await downloadStudy(uid, 'dcm', rawName);
                                      }}
                                    >
                                      DCM
                                    </button>
                                    <button
                                      className="w-full text-left px-3 py-1.5 hover:bg-gray-100 text-gray-700"
                                      onClick={async () => {
                                        setOpenDownloadFor(null);
                                        const rawName = name || pid || uid;
                                        await downloadStudy(uid, 'png', rawName);
                                      }}
                                    >
                                      PNG
                                    </button>
                                  </div>
                                </div>
                              )}
                            </div>
                            <a 
                              className="px-1.5 py-1 text-xs bg-blue-100 hover:bg-blue-200 text-blue-700 rounded"
                              href={viewerLink} 
                              target="_blank" 
                              rel="noreferrer"
                            >
                              View
                            </a>
                            <button
                              className="px-1.5 py-1 text-xs bg-green-100 hover:bg-green-200 text-green-700 rounded"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(copyLink);
                                  toast.success('Copied');
                                } catch {
                                  toast.error('Copy failed');
                                }
                              }}
                            >
                              Copy
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {items.length === 0 && (
                    <tr>
                      <td className="px-2 py-12 text-gray-500 text-center text-sm" colSpan={9}>
                        No studies found. Try adjusting your search criteria.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            
            {/* Fixed Pagination Footer - Always Visible */}
            <div className="flex-shrink-0 px-3 py-2 bg-gray-50 flex items-center justify-between border-t text-sm">
              <div className="text-gray-600 flex items-center gap-3">
                <span>Showing {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.offset + items.length)}</span>
                <label className="flex items-center gap-1">
                  Per page:
                  <select
                    className="ml-1 border rounded px-1 py-0.5 text-xs bg-white"
                    value={pagination.limit}
                    onChange={(e) => {
                      const lim = parseInt(e.target.value);
                      setPagination((p) => ({ ...p, limit: lim, offset: 0 }));
                      fetchData({ limit: lim, offset: 0 });
                    }}
                  >
                    {[10,20,25,50].map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex gap-1">
                <button 
                  className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" 
                  onClick={() => handlePage(-1)} 
                  disabled={pagination.offset === 0}
                >
                  Previous
                </button>
                <button 
                  className="px-2 py-1 text-xs bg-white border rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed" 
                  onClick={() => handlePage(1)} 
                  disabled={items.length < pagination.limit}
                >
                  Next
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default StudiesPage;
