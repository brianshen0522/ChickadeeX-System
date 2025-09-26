import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { createReport } from '../services/reportService';
import { ArrowLeft, Save } from 'lucide-react';
import toast from 'react-hot-toast';
import LoadingSpinner from '../components/UI/LoadingSpinner';

const CreateReportPage = () => {
  const navigate = useNavigate();
  const [isLoading, setIsLoading] = useState(false);
  
  const {
    register,
    handleSubmit,
    formState: { errors }
  } = useForm();

  const onSubmit = async (data) => {
    setIsLoading(true);
    try {
      const report = await createReport(data);
      toast.success('Report created successfully!');
      navigate(`/reports/${report.id}`);
    } catch (error) {
      toast.error(error.response?.data?.error || 'Failed to create report');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto">
      <div className="mb-6">
        <button
          onClick={() => navigate('/reports')}
          className="btn btn-secondary mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Reports
        </button>
        
        <h1 className="text-2xl font-bold text-gray-900">Create New Report</h1>
        <p className="mt-1 text-sm text-gray-600">
          Enter the study details to create a new medical imaging report.
        </p>
      </div>

      <div className="bg-white shadow rounded-lg">
        <form onSubmit={handleSubmit(onSubmit)} className="p-6 space-y-6">
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label htmlFor="study_instance_uid" className="form-label">
                Study Instance UID *
              </label>
              <input
                type="text"
                id="study_instance_uid"
                className={`form-input ${errors.study_instance_uid ? 'border-red-300' : ''}`}
                {...register('study_instance_uid', {
                  required: 'Study Instance UID is required'
                })}
              />
              {errors.study_instance_uid && (
                <p className="mt-1 text-sm text-red-600">{errors.study_instance_uid.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="patient_id" className="form-label">
                Patient ID *
              </label>
              <input
                type="text"
                id="patient_id"
                className={`form-input ${errors.patient_id ? 'border-red-300' : ''}`}
                {...register('patient_id', {
                  required: 'Patient ID is required'
                })}
              />
              {errors.patient_id && (
                <p className="mt-1 text-sm text-red-600">{errors.patient_id.message}</p>
              )}
            </div>

            <div>
              <label htmlFor="patient_name" className="form-label">
                Patient Name
              </label>
              <input
                type="text"
                id="patient_name"
                className="form-input"
                {...register('patient_name')}
              />
            </div>

            <div>
              <label htmlFor="patient_dob" className="form-label">
                Date of Birth
              </label>
              <input
                type="date"
                id="patient_dob"
                className="form-input"
                {...register('patient_dob')}
              />
            </div>

            <div>
              <label htmlFor="study_date" className="form-label">
                Study Date
              </label>
              <input
                type="date"
                id="study_date"
                className="form-input"
                {...register('study_date')}
              />
            </div>

            <div>
              <label htmlFor="modality" className="form-label">
                Modality
              </label>
              <select
                id="modality"
                className="form-input"
                {...register('modality')}
              >
                <option value="">Select Modality</option>
                <option value="CT">CT</option>
                <option value="MRI">MRI</option>
                <option value="X-Ray">X-Ray</option>
                <option value="Ultrasound">Ultrasound</option>
                <option value="Mammography">Mammography</option>
                <option value="Nuclear Medicine">Nuclear Medicine</option>
                <option value="PET">PET</option>
                <option value="Fluoroscopy">Fluoroscopy</option>
              </select>
            </div>
          </div>

          <div>
            <label htmlFor="study_description" className="form-label">
              Study Description
            </label>
            <textarea
              id="study_description"
              rows={3}
              className="form-input"
              placeholder="Describe the imaging study..."
              {...register('study_description')}
            />
          </div>

          <div className="flex justify-end space-x-4">
            <button
              type="button"
              onClick={() => navigate('/reports')}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isLoading}
              className="btn btn-primary"
            >
              {isLoading ? (
                <LoadingSpinner size="small" />
              ) : (
                <>
                  <Save className="h-4 w-4 mr-2" />
                  Create Report
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default CreateReportPage;