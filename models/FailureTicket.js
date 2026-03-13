module.exports = function defineFailureTicket(sequelize, DataTypes) {
  const VALID_STATUSES = new Set(['OPEN', 'BENCH', 'FIXED', 'SCRAP']);

  return sequelize.define('FailureTicket', {
    id: {
      type: DataTypes.INTEGER,
      autoIncrement: true,
      primaryKey: true,
    },
    serial_number: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    model_rev: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    failure_signature: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        notEmpty: true,
      },
    },
    technician_id: {
      type: DataTypes.STRING,
      allowNull: true,
      defaultValue: '',
    },
    department_id: {
      type: DataTypes.INTEGER,
      allowNull: true,
    },
    status: {
      type: DataTypes.STRING,
      allowNull: false,
      defaultValue: 'OPEN',
    },
    total_bench_time: {
      type: DataTypes.FLOAT,
      allowNull: false,
      defaultValue: 0,
    },
    verification_pass: {
      type: DataTypes.TEXT,
      allowNull: true,
      defaultValue: '',
    },
    created_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    updated_at: {
      type: DataTypes.DATE,
      allowNull: false,
      defaultValue: DataTypes.NOW,
    },
    closed_at: {
      type: DataTypes.DATE,
      allowNull: true,
    },
  }, {
    tableName: 'failure_tickets',
    timestamps: false,
    hooks: {
      beforeValidate(ticket) {
        const serialNumber = String(ticket.serial_number || '').trim().toUpperCase();
        const modelRev = String(ticket.model_rev || '').trim();
        const failureSignature = String(ticket.failure_signature || '').trim();
        const technicianId = String(ticket.technician_id || '').trim();
        const verificationPass = String(ticket.verification_pass || '').trim();
        const status = String(ticket.status || 'OPEN').trim().toUpperCase();
        const benchTimeValue = Number(ticket.total_bench_time);

        ticket.serial_number = serialNumber;
        ticket.model_rev = modelRev;
        ticket.failure_signature = failureSignature;
        ticket.technician_id = technicianId;
        ticket.verification_pass = verificationPass;
        ticket.status = VALID_STATUSES.has(status) ? status : 'OPEN';
        ticket.total_bench_time = Number.isFinite(benchTimeValue) && benchTimeValue >= 0
          ? benchTimeValue
          : 0;
      },
      beforeSave(ticket) {
        const now = new Date();
        ticket.updated_at = now;

        if (ticket.status === 'FIXED' || ticket.status === 'SCRAP') {
          if (!ticket.closed_at) {
            ticket.closed_at = now;
          }
        } else {
          ticket.closed_at = null;
        }
      },
    },
  });
};
