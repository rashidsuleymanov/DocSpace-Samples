import { useMemo, useRef, useState } from "react";
import folderStructure from "../data/folderStructure.js";
import { getLocalDateInputValue } from "../utils/doctorPortal.js";

const folderMetaByTitle = new Map(
  folderStructure.map((item) => [normalizeTitle(item.title), item])
);

function normalizeTitle(value) {
  return String(value || "").trim().toLowerCase();
}

export function useDoctorPortalViewState() {
  const [view, setView] = useState("doctor-schedule");
  const [rooms, setRooms] = useState([]);
  const [patientQuery, setPatientQuery] = useState("");
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [summary, setSummary] = useState([]);
  const [labResults, setLabResults] = useState([]);
  const [labLoading, setLabLoading] = useState(false);
  const [activeFolderTitle, setActiveFolderTitle] = useState("");
  const [folderStack, setFolderStack] = useState([]);
  const [activeFolderItems, setActiveFolderItems] = useState([]);
  const [activeFolderLoading, setActiveFolderLoading] = useState(false);
  const [templatesLoading, setTemplatesLoading] = useState(false);
  const [templatesError, setTemplatesError] = useState("");
  const [templateFiles, setTemplateFiles] = useState([]);
  const [templatesQuery, setTemplatesQuery] = useState("");
  const [fillTab, setFillTab] = useState("action");
  const [fillItems, setFillItems] = useState([]);
  const [fillLoading, setFillLoading] = useState(false);
  const [fillError, setFillError] = useState("");
  const [fillCounts, setFillCounts] = useState({ action: 0, completed: 0 });
  const [inboxTab, setInboxTab] = useState("action");
  const [inboxItems, setInboxItems] = useState([]);
  const [inboxLoading, setInboxLoading] = useState(false);
  const [inboxError, setInboxError] = useState("");
  const [inboxCounts, setInboxCounts] = useState({ action: 0, completed: 0 });
  const [fillPatientQuery, setFillPatientQuery] = useState("");
  const [dateFilter, setDateFilter] = useState(getLocalDateInputValue());
  const [appointments, setAppointments] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [docModal, setDocModal] = useState({ open: false, title: "", url: "" });
  const [labModalOpen, setLabModalOpen] = useState(false);
  const [labMode, setLabMode] = useState("local");
  const [labFile, setLabFile] = useState(null);
  const [imagingUploadOpen, setImagingUploadOpen] = useState(false);
  const [imagingUploadFile, setImagingUploadFile] = useState(null);
  const [imagingReportForm, setImagingReportForm] = useState({
    modality: "",
    studyDate: "",
    findings: "",
    impression: ""
  });
  const [imagingPackageOpen, setImagingPackageOpen] = useState(false);
  const [imagingPackageFiles, setImagingPackageFiles] = useState([]);
  const [fillModalOpen, setFillModalOpen] = useState(false);
  const [rxModalOpen, setRxModalOpen] = useState(false);
  const [recordModalOpen, setRecordModalOpen] = useState(false);
  const [docCreateModalOpen, setDocCreateModalOpen] = useState(false);
  const [sickLeaveOpen, setSickLeaveOpen] = useState(false);
  const [sickLeaveForm, setSickLeaveForm] = useState({
    startDate: "",
    endDate: "",
    diagnosis: "",
    note: ""
  });
  const [labForm, setLabForm] = useState({ title: "" });
  const [rxForm, setRxForm] = useState({ medication: "", dosage: "", instructions: "" });
  const [recordForm, setRecordForm] = useState({
    appointmentId: "",
    type: "Visit note",
    title: "",
    date: getLocalDateInputValue(),
    summary: ""
  });
  const [docCreateForm, setDocCreateForm] = useState({ title: "" });

  const editorRef = useRef(null);

  const selectedRoom = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId) || null,
    [rooms, selectedRoomId]
  );

  const filteredRooms = useMemo(() => {
    const query = patientQuery.trim().toLowerCase();
    if (!query) return rooms;
    return rooms.filter((room) => String(room.patientName || "").toLowerCase().includes(query));
  }, [rooms, patientQuery]);

  const filteredFillRooms = useMemo(() => {
    const query = fillPatientQuery.trim().toLowerCase();
    if (!query) return rooms;
    return rooms.filter((room) => String(room.patientName || "").toLowerCase().includes(query));
  }, [rooms, fillPatientQuery]);

  const patientAppointments = useMemo(() => {
    if (!selectedRoom) return [];
    return appointments.filter((item) => item.roomId === selectedRoom.id && item.status === "Scheduled");
  }, [appointments, selectedRoom]);

  const scheduledAppointments = useMemo(
    () => appointments.filter((item) => item.status === "Scheduled"),
    [appointments]
  );

  const doctorFolders = useMemo(() => {
    return summary.map((folder) => {
      const meta = folderMetaByTitle.get(normalizeTitle(folder.title)) || {};
      const count = (folder.filesCount || 0) + (folder.foldersCount || 0);
      return {
        id: folder.id,
        title: folder.title,
        icon: meta.icon || "folder",
        description: meta.description || "Patient documents",
        count
      };
    });
  }, [summary]);

  const filteredTemplates = useMemo(() => {
    const query = templatesQuery.trim().toLowerCase();
    if (!query) return templateFiles;
    return templateFiles.filter((file) => String(file.title || "").toLowerCase().includes(query));
  }, [templateFiles, templatesQuery]);

  const isLabFolderActive = activeFolderTitle === "Lab Results";
  const isPrescriptionFolderActive = activeFolderTitle === "Prescriptions";
  const isImagingFolderActive = activeFolderTitle === "Imaging";
  const isSickLeaveFolderActive = activeFolderTitle === "Sick Leave";
  const isGenericDocFolderActive = ["Contracts", "Insurance", "Personal Data"].includes(activeFolderTitle);

  return {
    view, setView, rooms, setRooms, patientQuery, setPatientQuery, selectedRoomId, setSelectedRoomId,
    summary, setSummary, labResults, setLabResults, labLoading, setLabLoading, activeFolderTitle,
    setActiveFolderTitle, folderStack, setFolderStack, activeFolderItems, setActiveFolderItems,
    activeFolderLoading, setActiveFolderLoading, templatesLoading, setTemplatesLoading, templatesError,
    setTemplatesError, templateFiles, setTemplateFiles, templatesQuery, setTemplatesQuery, fillTab,
    setFillTab, fillItems, setFillItems, fillLoading, setFillLoading, fillError, setFillError,
    fillCounts, setFillCounts, inboxTab, setInboxTab, inboxItems, setInboxItems, inboxLoading,
    setInboxLoading, inboxError, setInboxError, inboxCounts, setInboxCounts, fillPatientQuery,
    setFillPatientQuery, dateFilter, setDateFilter, appointments, setAppointments, busy, setBusy,
    message, setMessage, docModal, setDocModal, labModalOpen, setLabModalOpen, labMode, setLabMode,
    labFile, setLabFile, imagingUploadOpen, setImagingUploadOpen, imagingUploadFile, setImagingUploadFile,
    imagingReportForm, setImagingReportForm, imagingPackageOpen, setImagingPackageOpen,
    imagingPackageFiles, setImagingPackageFiles, fillModalOpen, setFillModalOpen, rxModalOpen,
    setRxModalOpen, recordModalOpen, setRecordModalOpen, docCreateModalOpen, setDocCreateModalOpen,
    sickLeaveOpen, setSickLeaveOpen, sickLeaveForm, setSickLeaveForm, labForm, setLabForm, rxForm,
    setRxForm, recordForm, setRecordForm, docCreateForm, setDocCreateForm, editorRef, selectedRoom,
    filteredRooms, filteredFillRooms, patientAppointments, scheduledAppointments, doctorFolders,
    filteredTemplates, isLabFolderActive, isPrescriptionFolderActive, isImagingFolderActive,
    isSickLeaveFolderActive, isGenericDocFolderActive
  };
}
