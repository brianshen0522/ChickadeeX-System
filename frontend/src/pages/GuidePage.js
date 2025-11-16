import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePageContext } from '../contexts/PageContext';
import { useAuth } from '../contexts/AuthContext';
import {
  UploadCloud,
  Sparkles,
  FileText,
  Edit3,
  ArrowRight,
  Image,
  Wand2,
  Save,
  FolderOpen,
  CheckCircle,
  Eye,
  Download,
  Info,
  ArrowDown,
  MoveRight,
  Trash2,
  PenSquare
} from 'lucide-react';

const GuidePage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();
  const { user } = useAuth();
  const canAccessDemo = user?.role === 'observer';

  useEffect(() => {
    setPageTitle('Guide');
    setPageDescription('Learn how to use the ChickadeeX Demo workspace step by step');
    setBreadcrumbs([
      { label: 'Home', href: '/' },
      { label: 'Guide', href: undefined, isCurrent: true }
    ]);
  }, [setPageDescription, setPageTitle, setBreadcrumbs]);

  const steps = [
    {
      number: 1,
      title: 'Upload X-ray',
      titleZh: '上傳 X 光片',
      description: 'Upload patient X-ray images through the secure upload interface. Supports DICOM and standard image formats.',
      descriptionZh: '透過安全的上傳介面上傳患者 X 光片。支援 DICOM 及標準圖檔格式。',
      icon: UploadCloud,
      color: 'blue',
      image: 'guide_1_upload.png'
    },
    {
      number: 2,
      title: 'Generate Report',
      titleZh: '生成報告',
      description: 'Click generate to create an AI-assisted report draft based on the uploaded images using configured LLM.',
      descriptionZh: '點擊生成按鈕，使用已配置的 LLM 根據上傳的影像建立 AI 輔助報告草稿。',
      icon: Sparkles,
      color: 'purple',
      beforeImage: 'guide_2_generate_before.png',
      afterImage: 'guide_2_generate_after.png',
      hasBeforeAfter: true
    },
    {
      number: 3,
      title: 'Edit & Save',
      titleZh: '編輯與儲存',
      description: 'Review and edit the AI-generated content. Add your professional insights and save the draft report.',
      descriptionZh: '檢視並編輯 AI 生成的內容。加入您的專業見解並儲存報告草稿。',
      icon: Edit3,
      color: 'green',
      beforeImage: 'guide_3_edit.png',
      afterImage: 'guide_3_save.png',
      hasBeforeAfter: true
    },
    {
      number: 4,
      title: 'Version Control',
      titleZh: '版本控制',
      description: 'Track all changes with automatic version history. View, compare, or restore previous versions anytime.',
      descriptionZh: '透過自動版本歷史追蹤所有變更。隨時檢視、比較或還原先前的版本。',
      icon: Save,
      color: 'orange',
      image: 'guide_4_version.png'
    },
    {
      number: 5,
      title: 'Manage Drafts',
      titleZh: '管理草稿',
      description: 'Organize all draft reports in one place. Search, filter by patient, or date range.',
      descriptionZh: '在一個地方整理所有報告草稿。依患者或日期範圍搜尋與篩選。',
      icon: FileText,
      color: 'teal',
      image: 'guide_5_drafts.png'
    },
    {
      number: 6,
      title: 'View & Re-edit',
      titleZh: '檢視與重新編輯',
      description: 'Access finalized reports anytime for viewing. Create new versions if modifications are needed.',
      descriptionZh: '隨時存取已完成的報告以供檢視。如需修改可建立新版本。',
      icon: Eye,
      color: 'emerald',
      image: 'guide_6_review.png',
      hasButtons: true
    },
    {
      number: 7,
      title: 'Finalize Reports',
      titleZh: '完成報告',
      description: 'Mark reports as finalized after final review.',
      descriptionZh: '最終審核後將報告標記為完成。',
      icon: CheckCircle,
      color: 'indigo',
      image: 'guide_7_finalize.png'
    }
  ];

  const colorMap = {
    blue: 'from-blue-500 to-blue-600 bg-blue-100 text-blue-600 border-blue-200',
    purple: 'from-purple-500 to-purple-600 bg-purple-100 text-purple-600 border-purple-200',
    green: 'from-green-500 to-green-600 bg-green-100 text-green-600 border-green-200',
    orange: 'from-orange-500 to-orange-600 bg-orange-100 text-orange-600 border-orange-200',
    teal: 'from-teal-500 to-teal-600 bg-teal-100 text-teal-600 border-teal-200',
    indigo: 'from-indigo-500 to-indigo-600 bg-indigo-100 text-indigo-600 border-indigo-200',
    emerald: 'from-emerald-500 to-emerald-600 bg-emerald-100 text-emerald-600 border-emerald-200'
  };

  return (
    <div className="mx-auto max-w-7xl space-y-8 px-4 py-6">
      {/* Header */}
      <div className="border-b border-slate-200 pb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold text-slate-900">Doctor Workflow</h1>
            <p className="text-lg text-slate-600">醫師工作流程</p>
          </div>
          {canAccessDemo && (
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              <UploadCloud className="h-5 w-5" />
              <span>Start Demo</span>
            </Link>
          )}
        </div>
      </div>

      {/* Steps */}
      <div className="space-y-8">
        {/* Section 1: Report Creation */}
        <div>
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-slate-900">Report Creation</h2>
            <p className="text-lg text-slate-600">報告建立</p>
          </div>
          
          <div className="space-y-6">
            {steps.slice(0, 4).map((step, idx) => {
              const colors = colorMap[step.color].split(' ');
              const gradientColors = colors[0];
              const bgColor = colors[1];
              const textColor = colors[2];

              return (
                <div key={step.number}>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-4">
                      {/* Left: Icon and Title */}
                      <div className="flex-shrink-0">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${gradientColors} text-white`}>
                          <step.icon className="h-5 w-5" />
                        </div>
                      </div>

                      {/* Middle: Content */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${bgColor} ${textColor} text-xs font-bold`}>
                            {step.number}
                          </span>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
                            <p className="text-sm text-slate-600">{step.titleZh}</p>
                          </div>
                        </div>

                        {step.hasBeforeAfter ? (
                          <div className="space-y-3">
                            {/* Description at top */}
                            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                              <p className="text-sm leading-relaxed text-slate-700">{step.description}</p>
                              <p className="text-sm leading-relaxed text-slate-500">{step.descriptionZh}</p>
                            </div>

                            {/* Before → After Images */}
                            <div className="flex items-center gap-3">
                              {/* Before */}
                              <div className="flex-1">
                                <div className="mb-1 text-center">
                                  <span className="inline-block rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                    {step.number === 2 ? 'Generating...' : step.number === 3 ? 'Editing...' : 'Before'}
                                  </span>
                                </div>
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                  <div className="aspect-video flex items-center justify-center">
                                    <img
                                      src={`/assets/guide/${step.beforeImage}`}
                                      alt={`${step.title} - Before`}
                                      className="h-full w-full object-contain"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                      }}
                                    />
                                    <div className="hidden h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                      Image: {step.beforeImage}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Arrow */}
                              <div className="flex-shrink-0">
                                <ArrowRight className="h-6 w-6 text-blue-500" />
                              </div>

                              {/* After */}
                              <div className="flex-1">
                                <div className="mb-1 text-center">
                                  <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">After</span>
                                </div>
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                  <div className="aspect-video flex items-center justify-center">
                                    <img
                                      src={`/assets/guide/${step.afterImage}`}
                                      alt={`${step.title} - After`}
                                      className="h-full w-full object-contain"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                      }}
                                    />
                                    <div className="hidden h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                      Image: {step.afterImage}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Image */}
                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                              <div className="aspect-video flex items-center justify-center">
                                <img
                                  src={`/assets/guide/${step.image}`}
                                  alt={step.title}
                                  className="h-full w-full object-contain"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                                <div className="hidden h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                  Image: {step.image}
                                </div>
                              </div>
                            </div>

                            {/* Description */}
                            <div className="flex flex-col justify-center space-y-2">
                              <p className="text-sm leading-relaxed text-slate-700">{step.description}</p>
                              <p className="text-sm leading-relaxed text-slate-500">{step.descriptionZh}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Simple Arrow */}
                  {idx < 3 && (
                    <div className="flex justify-center py-2">
                      <ArrowDown className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Center Divider */}
        <div className="flex justify-center py-4">
          <ArrowDown className="h-6 w-6 text-blue-500" />
        </div>

        {/* Section 2: Organize & Finalize */}
        <div>
          <div className="mb-6 text-center">
            <h2 className="text-2xl font-bold text-slate-900">Report Management</h2>
            <p className="text-lg text-slate-600">報告管理</p>
          </div>
          
          <div className="space-y-6">
            {steps.slice(4, 7).map((step, idx) => {
              const colors = colorMap[step.color].split(' ');
              const gradientColors = colors[0];
              const bgColor = colors[1];
              const textColor = colors[2];

              return (
                <div key={step.number}>
                  <div className="rounded-lg border border-slate-200 bg-white p-4">
                    <div className="flex items-start gap-4">
                      {/* Left: Icon and Title */}
                      <div className="flex-shrink-0">
                        <div className={`flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br ${gradientColors} text-white`}>
                          <step.icon className="h-5 w-5" />
                        </div>
                      </div>

                      {/* Middle: Content */}
                      <div className="min-w-0 flex-1">
                        <div className="mb-3 flex items-center gap-2">
                          <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${bgColor} ${textColor} text-xs font-bold`}>
                            {step.number}
                          </span>
                          <div>
                            <h3 className="text-lg font-bold text-slate-900">{step.title}</h3>
                            <p className="text-sm text-slate-600">{step.titleZh}</p>
                          </div>
                        </div>

                        {step.hasBeforeAfter ? (
                          <div className="space-y-3">
                            {/* Description at top */}
                            <div className="space-y-2 rounded-lg bg-slate-50 p-3">
                              <p className="text-sm leading-relaxed text-slate-700">{step.description}</p>
                              <p className="text-sm leading-relaxed text-slate-500">{step.descriptionZh}</p>
                            </div>

                            {/* Before → After Images */}
                            <div className="flex items-center gap-3">
                              {/* Before */}
                              <div className="flex-1">
                                <div className="mb-1 text-center">
                                  <span className="inline-block rounded bg-slate-200 px-2 py-0.5 text-xs font-semibold text-slate-700">
                                    {step.number === 2 ? 'Generating...' : step.number === 3 ? 'Editing...' : 'Before'}
                                  </span>
                                </div>
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                  <div className="aspect-video flex items-center justify-center">
                                    <img
                                      src={`/assets/guide/${step.beforeImage}`}
                                      alt={`${step.title} - Before`}
                                      className="h-full w-full object-contain"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                      }}
                                    />
                                    <div className="hidden h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                      Image: {step.beforeImage}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              {/* Arrow */}
                              <div className="flex-shrink-0">
                                <ArrowRight className="h-6 w-6 text-blue-500" />
                              </div>

                              {/* After */}
                              <div className="flex-1">
                                <div className="mb-1 text-center">
                                  <span className="inline-block rounded bg-green-100 px-2 py-0.5 text-xs font-semibold text-green-700">After</span>
                                </div>
                                <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                                  <div className="aspect-video flex items-center justify-center">
                                    <img
                                      src={`/assets/guide/${step.afterImage}`}
                                      alt={`${step.title} - After`}
                                      className="h-full w-full object-contain"
                                      onError={(e) => {
                                        e.target.style.display = 'none';
                                        e.target.nextSibling.style.display = 'flex';
                                      }}
                                    />
                                    <div className="hidden h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                      Image: {step.afterImage}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            </div>
                          </div>
                        ) : step.hasButtons ? (
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Image */}
                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                              <div className="aspect-auto flex items-center justify-center">
                                <img
                                  src={`/assets/guide/${step.image}`}
                                  alt={step.title}
                                  className="h-full w-full object-contain"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                                <div className="hidden h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                  Image: {step.image}
                                </div>
                              </div>
                            </div>

                            {/* Interactive Buttons with Info */}
                            <div className="flex flex-col justify-center space-y-4">
                              {/* Edit in Demo Button */}
                              <div className="space-y-2">
                                <button
                                  disabled
                                  className="flex w-full items-center gap-2 rounded-lg border border-blue-300 bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 transition hover:bg-blue-100"
                                >
                                  <PenSquare className="h-4 w-4" />
                                  Edit in Demo
                                </button>
                                <p className="text-xs leading-relaxed text-slate-700">
                                  Create a new draft version to modify the report
                                </p>
                                <p className="text-xs leading-relaxed text-slate-500">
                                  建立新的草稿版本以修改報告
                                </p>
                              </div>

                              {/* Delete Button */}
                              <div className="space-y-2">
                                <button
                                  disabled
                                  className="flex w-full items-center gap-2 rounded-lg border border-red-300 bg-red-50 px-4 py-2.5 text-sm font-semibold text-red-700 transition hover:bg-red-100"
                                >
                                  <Trash2 className="h-4 w-4" />
                                  Delete report
                                </button>
                                <p className="text-xs leading-relaxed text-slate-700">
                                  Permanently remove this report from the system
                                </p>
                                <p className="text-xs leading-relaxed text-slate-500">
                                  從系統中永久刪除此報告
                                </p>
                              </div>

                              {/* Finalize Button */}
                              <div className="space-y-2">
                                <button
                                  type="button"
                                  className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow hover:bg-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-400"
                                >
                                  <CheckCircle className="h-4 w-4" />
                                  Finalize Report
                                </button>
                                <p className="text-xs leading-relaxed text-slate-700">
                                  Lock the report and mark it as finalized
                                </p>
                                <p className="text-xs leading-relaxed text-slate-500">
                                  鎖定報告並標記為已完成
                                </p>
                              </div>
                            </div>
                          </div>
                        ) : (
                          <div className="grid gap-4 md:grid-cols-2">
                            {/* Image */}
                            <div className="overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                              <div className="aspect-video flex items-center justify-center">
                                <img
                                  src={`/assets/guide/${step.image}`}
                                  alt={step.title}
                                  className="h-full w-full object-contain"
                                  onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'flex';
                                  }}
                                />
                                <div className="hidden h-full items-center justify-center p-4 text-center text-sm text-slate-500">
                                  Image: {step.image}
                                </div>
                              </div>
                            </div>

                            {/* Description */}
                            <div className="flex flex-col justify-center space-y-2">
                              <p className="text-sm leading-relaxed text-slate-700">{step.description}</p>
                              <p className="text-sm leading-relaxed text-slate-500">{step.descriptionZh}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {/* Simple Arrow */}
                  {idx < 2 && (
                    <div className="flex justify-center py-2">
                      <ArrowDown className="h-5 w-5 text-slate-400" />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-200 pt-6 text-center">
        {canAccessDemo && (
          <div className="mt-4 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/demo"
              className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-700"
            >
              <UploadCloud className="h-5 w-5" />
              <span>Start Demo</span>
            </Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default GuidePage;
