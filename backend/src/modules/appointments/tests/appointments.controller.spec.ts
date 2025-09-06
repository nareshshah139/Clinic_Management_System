import { Test, TestingModule } from '@nestjs/testing';
import { AppointmentsController } from '../appointments.controller';
import { AppointmentsService } from '../appointments.service';
import { JwtAuthGuard } from '../../../shared/guards/jwt-auth.guard';
import { AppointmentStatus, VisitType } from '@prisma/client';

describe('AppointmentsController', () => {
  let controller: AppointmentsController;
  let service: AppointmentsService;

  const mockAppointmentsService = {
    create: jest.fn(),
    findAll: jest.fn(),
    findOne: jest.fn(),
    update: jest.fn(),
    reschedule: jest.fn(),
    bulkUpdate: jest.fn(),
    remove: jest.fn(),
    getAvailableSlots: jest.fn(),
    getDoctorSchedule: jest.fn(),
    getRoomSchedule: jest.fn(),
  };

  const mockRequest = {
    user: {
      id: 'user-123',
      branchId: 'branch-123',
      role: 'DOCTOR',
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AppointmentsController],
      providers: [
        {
          provide: AppointmentsService,
          useValue: mockAppointmentsService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AppointmentsController>(AppointmentsController);
    service = module.get<AppointmentsService>(AppointmentsService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('should create an appointment', async () => {
      const createAppointmentDto = {
        patientId: 'patient-123',
        doctorId: 'doctor-123',
        roomId: 'room-123',
        date: '2024-12-25',
        slot: '10:00-10:30',
        visitType: VisitType.OPD,
        notes: 'Regular checkup',
        source: 'Walk-in',
      };

      const mockAppointment = {
        id: 'appointment-123',
        ...createAppointmentDto,
      };

      mockAppointmentsService.create.mockResolvedValue(mockAppointment);

      const result = await controller.create(createAppointmentDto, mockRequest as any);

      expect(result).toEqual(mockAppointment);
      expect(service.create).toHaveBeenCalledWith(createAppointmentDto, mockRequest.user.branchId);
    });
  });

  describe('findAll', () => {
    it('should return paginated appointments', async () => {
      const query = {
        page: 1,
        limit: 20,
        doctorId: 'doctor-123',
      };

      const mockResult = {
        appointments: [],
        pagination: {
          total: 0,
          page: 1,
          limit: 20,
          pages: 0,
        },
      };

      mockAppointmentsService.findAll.mockResolvedValue(mockResult);

      const result = await controller.findAll(query, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.findAll).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getAvailableSlots', () => {
    it('should return available slots', async () => {
      const query = {
        doctorId: 'doctor-123',
        date: '2024-12-25',
        durationMinutes: 30,
      };

      const mockSlots = {
        date: '2024-12-25',
        doctorId: 'doctor-123',
        availableSlots: ['09:00-09:30', '09:30-10:00'],
        bookedSlots: ['10:00-10:30'],
      };

      mockAppointmentsService.getAvailableSlots.mockResolvedValue(mockSlots);

      const result = await controller.getAvailableSlots(query, mockRequest as any);

      expect(result).toEqual(mockSlots);
      expect(service.getAvailableSlots).toHaveBeenCalledWith(query, mockRequest.user.branchId);
    });
  });

  describe('getDoctorSchedule', () => {
    it('should return doctor schedule', async () => {
      const doctorId = 'doctor-123';
      const date = '2024-12-25';

      const mockSchedule = {
        doctorId,
        doctorName: 'Dr. Smith',
        date,
        appointments: [],
      };

      mockAppointmentsService.getDoctorSchedule.mockResolvedValue(mockSchedule);

      const result = await controller.getDoctorSchedule(doctorId, date, mockRequest as any);

      expect(result).toEqual(mockSchedule);
      expect(service.getDoctorSchedule).toHaveBeenCalledWith(
        doctorId,
        date,
        mockRequest.user.branchId,
      );
    });
  });

  describe('getRoomSchedule', () => {
    it('should return room schedule', async () => {
      const roomId = 'room-123';
      const date = '2024-12-25';

      const mockSchedule = {
        roomId,
        roomName: 'Room 1',
        roomType: 'Consultation',
        date,
        appointments: [],
      };

      mockAppointmentsService.getRoomSchedule.mockResolvedValue(mockSchedule);

      const result = await controller.getRoomSchedule(roomId, date, mockRequest as any);

      expect(result).toEqual(mockSchedule);
      expect(service.getRoomSchedule).toHaveBeenCalledWith(
        roomId,
        date,
        mockRequest.user.branchId,
      );
    });
  });

  describe('findOne', () => {
    it('should return appointment by id', async () => {
      const appointmentId = 'appointment-123';
      const mockAppointment = {
        id: appointmentId,
        patientId: 'patient-123',
        doctorId: 'doctor-123',
      };

      mockAppointmentsService.findOne.mockResolvedValue(mockAppointment);

      const result = await controller.findOne(appointmentId, mockRequest as any);

      expect(result).toEqual(mockAppointment);
      expect(service.findOne).toHaveBeenCalledWith(appointmentId, mockRequest.user.branchId);
    });
  });

  describe('update', () => {
    it('should update appointment', async () => {
      const appointmentId = 'appointment-123';
      const updateDto = {
        status: AppointmentStatus.CONFIRMED,
        notes: 'Updated notes',
      };

      const mockUpdatedAppointment = {
        id: appointmentId,
        ...updateDto,
      };

      mockAppointmentsService.update.mockResolvedValue(mockUpdatedAppointment);

      const result = await controller.update(appointmentId, updateDto, mockRequest as any);

      expect(result).toEqual(mockUpdatedAppointment);
      expect(service.update).toHaveBeenCalledWith(
        appointmentId,
        updateDto,
        mockRequest.user.branchId,
      );
    });
  });

  describe('reschedule', () => {
    it('should reschedule appointment', async () => {
      const appointmentId = 'appointment-123';
      const rescheduleDto = {
        date: '2024-12-26',
        slot: '14:00-14:30',
        notes: 'Rescheduled',
      };

      const mockRescheduledAppointment = {
        id: appointmentId,
        ...rescheduleDto,
      };

      mockAppointmentsService.reschedule.mockResolvedValue(mockRescheduledAppointment);

      const result = await controller.reschedule(appointmentId, rescheduleDto, mockRequest as any);

      expect(result).toEqual(mockRescheduledAppointment);
      expect(service.reschedule).toHaveBeenCalledWith(
        appointmentId,
        rescheduleDto,
        mockRequest.user.branchId,
      );
    });
  });

  describe('bulkUpdate', () => {
    it('should bulk update appointments', async () => {
      const bulkUpdateDto = {
        appointmentIds: ['appointment-1', 'appointment-2'],
        status: AppointmentStatus.CONFIRMED,
      };

      const mockResult = {
        updated: 2,
        appointmentIds: bulkUpdateDto.appointmentIds,
      };

      mockAppointmentsService.bulkUpdate.mockResolvedValue(mockResult);

      const result = await controller.bulkUpdate(bulkUpdateDto, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.bulkUpdate).toHaveBeenCalledWith(bulkUpdateDto, mockRequest.user.branchId);
    });
  });

  describe('remove', () => {
    it('should cancel appointment', async () => {
      const appointmentId = 'appointment-123';
      const mockResult = { message: 'Appointment cancelled successfully' };

      mockAppointmentsService.remove.mockResolvedValue(mockResult);

      const result = await controller.remove(appointmentId, mockRequest as any);

      expect(result).toEqual(mockResult);
      expect(service.remove).toHaveBeenCalledWith(appointmentId, mockRequest.user.branchId);
    });
  });
});
