import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { usePageContext } from '../contexts/PageContext';
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
  Info
} from 'lucide-react';

const GuidePage = () => {
  const { setPageTitle, setPageDescription, setBreadcrumbs } = usePageContext();

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
      title: 'Access Demo',
      icon: UploadCloud,
      color: 'blue',
      video: 'guide_1_access.mp4'
    },
    {
      number: 2,
      title: 'Upload Image',
      icon: Image,
      color: 'purple',
      video: 'guide_2_upload.mp4'
    },
    {
      number: 3,
      title: 'Generate Report',
      icon: Wand2,
      color: 'green',
      video: 'guide_3_generate.mp4'
    },
    {
      number: 4,
      title: 'Review & Edit',
      icon: Edit3,
      color: 'orange',
      video: 'guide_4_edit.mp4'
    },
    {
      number: 5,
      title: 'Save Draft',
      icon: Save,
      color: 'teal',
      video: 'guide_5_save.mp4'
    },
    {
      number: 6,
      title: 'Manage Reports',
      icon: FolderOpen,
      color: 'indigo',
      video: 'guide_6_manage.mp4'
    },
    {
      number: 7,
      title: 'Finalize Report',
      icon: CheckCircle,
      color: 'emerald',
      video: 'guide_7_finalize.mp4'
    },
    {
      number: 8,
      title: 'View & Export',
      icon: Download,
      color: 'pink',
      video: 'guide_8_export.mp4'
    }
  ];

  const colorMap = {
    blue: 'from-blue-500 to-blue-600 bg-blue-100 text-blue-600 border-blue-200',
    purple: 'from-purple-500 to-purple-600 bg-purple-100 text-purple-600 border-purple-200',
    green: 'from-green-500 to-green-600 bg-green-100 text-green-600 border-green-200',
    orange: 'from-orange-500 to-orange-600 bg-orange-100 text-orange-600 border-orange-200',
    teal: 'from-teal-500 to-teal-600 bg-teal-100 text-teal-600 border-teal-200',
    indigo: 'from-indigo-500 to-indigo-600 bg-indigo-100 text-indigo-600 border-indigo-200',
    emerald: 'from-emerald-500 to-emerald-600 bg-emerald-100 text-emerald-600 border-emerald-200',
    pink: 'from-pink-500 to-pink-600 bg-pink-100 text-pink-600 border-pink-200'
  };

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-gradient-to-br from-blue-50 via-white to-white p-8 shadow-medical">
        <div className="flex items-start gap-4">
          <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-600">
            <FileText className="h-7 w-7" />
          </div>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-slate-900">Demo Workflow</h1>
            <p className="mt-2 text-base text-slate-600">
              Complete guide from upload to finalized report
            </p>
            <div className="mt-4">
              <Link
                to="/demo"
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 px-6 py-3 text-base font-semibold text-white shadow-[0_10px_28px_-12px_rgba(37,99,235,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_14px_35px_-12px_rgba(37,99,235,0.65)] focus:outline-none focus:ring-4 focus:ring-blue-500/30"
              >
                <UploadCloud className="h-5 w-5" />
                Start Demo
                <ArrowRight className="h-5 w-5" />
              </Link>
            </div>
          </div>
        </div>
      </div>

      {/* Steps */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {steps.map((step) => {
          const colors = colorMap[step.color].split(' ');
          const gradientColors = colors[0]; // from-X to-Y
          const bgColor = colors[1]; // bg-X
          const textColor = colors[2]; // text-X

          return (
            <div
              key={step.number}
              className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm transition hover:shadow-md"
            >
              {/* Header */}
              <div className="flex items-center gap-3">
                <div className={`flex h-12 w-12 flex-shrink-0 items-center justify-center rounded-full bg-gradient-to-br ${gradientColors} text-white shadow-lg`}>
                  <step.icon className="h-6 w-6" />
                </div>
                <div className="flex-1">
                  <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${bgColor} ${textColor} text-xs font-bold`}>
                    {step.number}
                  </span>
                  <h2 className="mt-1 text-base font-bold text-slate-900">{step.title}</h2>
                </div>
              </div>

              {/* Video Placeholder */}
              <div className="mt-4 overflow-hidden rounded-lg border border-slate-200 bg-slate-50">
                <div className="aspect-video flex items-center justify-center">
                  <video
                    className="h-full w-full object-cover"
                    autoPlay
                    loop
                    muted
                    playsInline
                    disablePictureInPicture
                    controlsList="nodownload nofullscreen noremoteplayback"
                    onContextMenu={(e) => e.preventDefault()}
                  >
                    <source src={`/assets/guide/${step.video}`} type="video/mp4" />
                    <div className="flex h-full items-center justify-center p-4 text-center text-xs text-slate-400">
                      Video: {step.video}
                    </div>
                  </video>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Footer */}
      <div className="rounded-2xl border border-blue-200 bg-gradient-to-br from-blue-50 via-blue-100/50 to-white p-8 text-center shadow-sm">
        <h3 className="text-xl font-bold text-slate-900">Ready to Get Started?</h3>
        <p className="mt-2 text-sm text-slate-600">
          Follow the 8-step workflow shown above
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <Link
            to="/demo"
            className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 px-8 py-3 text-base font-semibold text-white shadow-[0_12px_30px_-12px_rgba(37,99,235,0.6)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_-12px_rgba(37,99,235,0.65)] focus:outline-none focus:ring-4 focus:ring-blue-500/30"
          >
            <UploadCloud className="h-5 w-5" />
            Start Demo
            <ArrowRight className="h-5 w-5" />
          </Link>
          <Link
            to="/"
            className="inline-flex items-center gap-2 rounded-full border border-slate-300 bg-white px-6 py-3 text-base font-semibold text-slate-700 transition hover:border-blue-300 hover:bg-blue-50 hover:text-blue-700"
          >
            <Eye className="h-5 w-5" />
            Back to Home
          </Link>
        </div>
      </div>
    </div>
  );
};

export default GuidePage;
