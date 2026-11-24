-- RFC-000078: Simplificación del módulo de Resoluciones ANT y eliminación de cupos máximos de frecuencias.
-- Migración aditiva y no destructiva (expand/contract): conserva la tabla histórica RESOLUCIONES_ANT
-- y la columna ID_RES_PER (ahora nullable), enlazando cada frecuencia directamente con su cooperativa
-- mediante ID_COP_PER y registrando el respaldo administrativo en NUM_RES_FRE.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    IF COL_LENGTH('dbo.FRECUENCIAS', 'ID_COP_PER') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD ID_COP_PER varchar(5) NULL;

    IF COL_LENGTH('dbo.FRECUENCIAS', 'NUM_RES_FRE') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD NUM_RES_FRE nvarchar(50) NULL;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    -- Backfill idempotente desde RESOLUCIONES_ANT para todas las frecuencias existentes
    IF OBJECT_ID('dbo.RESOLUCIONES_ANT', 'U') IS NOT NULL
    BEGIN
        UPDATE f
        SET f.ID_COP_PER = r.ID_COP_PER
        FROM dbo.FRECUENCIAS f
        JOIN dbo.RESOLUCIONES_ANT r ON r.ID_RES = f.ID_RES_PER
        WHERE f.ID_COP_PER IS NULL;
    END;

    UPDATE dbo.FRECUENCIAS
    SET NUM_RES_FRE = LTRIM(RTRIM(ID_RES_PER))
    WHERE NUM_RES_FRE IS NULL AND ID_RES_PER IS NOT NULL;

    IF EXISTS (SELECT 1 FROM dbo.FRECUENCIAS WHERE ID_COP_PER IS NULL)
        THROW 51400, 'Existen frecuencias sin cooperativa asignable (ID_COP_PER NULL). Concilia antes de continuar.', 1;

    IF COLUMNPROPERTY(OBJECT_ID('dbo.FRECUENCIAS'), 'ID_COP_PER', 'AllowsNull') = 1
        ALTER TABLE dbo.FRECUENCIAS ALTER COLUMN ID_COP_PER varchar(5) NOT NULL;

    IF NOT EXISTS (SELECT 1 FROM sys.foreign_keys
                   WHERE parent_object_id = OBJECT_ID('dbo.FRECUENCIAS') AND name = 'FK_FRECUENCIAS_COOPERATIVA')
        ALTER TABLE dbo.FRECUENCIAS
            ADD CONSTRAINT FK_FRECUENCIAS_COOPERATIVA FOREIGN KEY (ID_COP_PER) REFERENCES dbo.COOPERATIVAS(ID_COP);

    IF NOT EXISTS (SELECT 1 FROM sys.indexes
                   WHERE object_id = OBJECT_ID('dbo.FRECUENCIAS') AND name = 'IX_FRECUENCIAS_COP')
        CREATE INDEX IX_FRECUENCIAS_COP ON dbo.FRECUENCIAS(ID_COP_PER, EST_RES);

    -- Desacoplar ID_RES_PER para que nuevas frecuencias no dependan de RESOLUCIONES_ANT
    IF EXISTS (SELECT 1 FROM sys.indexes
               WHERE object_id = OBJECT_ID('dbo.FRECUENCIAS') AND name = 'IX_CC_FRE_RES')
        DROP INDEX IX_CC_FRE_RES ON dbo.FRECUENCIAS;

    IF COLUMNPROPERTY(OBJECT_ID('dbo.FRECUENCIAS'), 'ID_RES_PER', 'AllowsNull') = 0
        ALTER TABLE dbo.FRECUENCIAS ALTER COLUMN ID_RES_PER varchar(5) NULL;

    -- Retirar triggers y check de cupos de resolución / cupos diarios de frecuencias
    IF OBJECT_ID('dbo.CK_FRE_CC_CONFIG', 'C') IS NOT NULL
        ALTER TABLE dbo.FRECUENCIAS DROP CONSTRAINT CK_FRE_CC_CONFIG;

    IF OBJECT_ID('dbo.TR_CC_CupoResolucion', 'TR') IS NOT NULL
        DROP TRIGGER dbo.TR_CC_CupoResolucion;

    IF OBJECT_ID('dbo.TR_CC_Frecuencias', 'TR') IS NOT NULL
        DROP TRIGGER dbo.TR_CC_Frecuencias;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO

-- Procedimiento de bloqueo transaccional conservado para operaciones concurrentes (CC-02 / reservas)
CREATE OR ALTER PROCEDURE dbo.cc_BloquearOperacion AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Resultado int;
    EXEC @Resultado = sys.sp_getapplock @Resource = N'transporte:frecuencias',
        @LockMode = 'Exclusive', @LockOwner = 'Transaction', @LockTimeout = 5000, @DbPrincipal = N'public';
    IF @Resultado < 0 THROW 51201, 'La operación está ocupada. Intenta nuevamente.', 1;
END;
GO

CREATE OR ALTER FUNCTION dbo.fn_CC_FechaEcuador(@UTC datetime2)
RETURNS date AS
BEGIN
    RETURN CONVERT(date, @UTC AT TIME ZONE 'UTC' AT TIME ZONE 'SA Pacific Standard Time');
END;
GO

CREATE OR ALTER VIEW dbo.v_CC_BoletosConCupo AS
SELECT ID_BOL, ID_HOJ_PER, ID_ASI_PER
FROM dbo.BOLETOS
WHERE UPPER(LTRIM(RTRIM(ISNULL(EST_BOL, '')))) NOT IN
    ('CANCELADO', 'CANCELADA', 'ANULADO', 'ANULADA', 'INVALIDO', 'INVALIDA', 'VENCIDO', 'VENCIDA', 'RECHAZADO', 'RECHAZADA');
GO

-- Vigencia simplificada: depende únicamente de la propia frecuencia (sin RESOLUCIONES_ANT ni revocación externa)
CREATE OR ALTER FUNCTION dbo.fn_CC_VigenciaFrecuencia(@Frecuencia varchar(5), @Fecha date)
RETURNS TABLE AS RETURN
(
    SELECT f.ID_FRE,
           f.ID_COP_PER,
           f.FEC_HOR_INI_FRE AS INICIO_EFECTIVO,
           f.FEC_HOR_FIN_FRE AS FIN_EFECTIVO,
           CASE
               WHEN ISNULL(f.EST_RES, '0') <> '1' THEN 'INACTIVA'
               WHEN @Fecha IS NULL THEN 'FECHA_INVALIDA'
               WHEN @Fecha < f.FEC_HOR_INI_FRE THEN 'PENDIENTE'
               WHEN f.FEC_HOR_FIN_FRE IS NOT NULL AND @Fecha > f.FEC_HOR_FIN_FRE THEN 'VENCIDA'
               ELSE 'VIGENTE'
           END AS EST_VIGENCIA
    FROM dbo.FRECUENCIAS f
    WHERE f.ID_FRE = @Frecuencia
);
GO

CREATE OR ALTER FUNCTION dbo.fn_CC_HojaVigente(@Hoja varchar(5), @Hoy date)
RETURNS TABLE AS RETURN
(
    SELECT h.ID_HOJ
    FROM dbo.HOJAS_RUTAS h
    CROSS APPLY dbo.fn_CC_VigenciaFrecuencia(h.ID_FRE_PER, h.FEC_PRO_HOJ) salida
    CROSS APPLY dbo.fn_CC_VigenciaFrecuencia(
        h.ID_FRE_PER,
        COALESCE(dbo.fn_CC_FechaEcuador(DATEADD(nanosecond, -100, h.LLEGADA_PLAN_UTC)), h.FEC_PRO_HOJ)
    ) llegada
    CROSS APPLY dbo.fn_CC_VigenciaFrecuencia(h.ID_FRE_PER, COALESCE(@Hoy, h.FEC_PRO_HOJ)) hoy
    WHERE h.ID_HOJ = @Hoja
      AND (h.SALIDA_PLAN_UTC IS NULL OR dbo.fn_CC_FechaEcuador(h.SALIDA_PLAN_UTC) = h.FEC_PRO_HOJ)
      AND salida.EST_VIGENCIA = 'VIGENTE'
      AND llegada.EST_VIGENCIA = 'VIGENTE'
      AND hoy.EST_VIGENCIA = 'VIGENTE'
);
GO

-- Protección de hojas de ruta sin cupos de unidades ni RESOLUCIONES_ANT:
-- mantiene inmutabilidad cuando hay boletos activos y validación de vigencia de frecuencia.
CREATE OR ALTER TRIGGER dbo.TR_CC_Hojas ON dbo.HOJAS_RUTAS AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Cambios TABLE (ID_HOJ varchar(5) PRIMARY KEY, ID_FRE varchar(5), DIA date, MOVIDA bit, OCUPA bit);
    INSERT @Cambios
    SELECT i.ID_HOJ, i.ID_FRE_PER, i.FEC_PRO_HOJ, m.MOVIDA, m.OCUPA
    FROM inserted i
    LEFT JOIN deleted d ON d.ID_HOJ = i.ID_HOJ
    CROSS APPLY (VALUES (
        CASE WHEN d.ID_HOJ IS NOT NULL AND (
              d.FEC_PRO_HOJ <> i.FEC_PRO_HOJ
           OR d.ID_FRE_PER <> i.ID_FRE_PER
           OR COALESCE(d.ID_BUS_REE, d.ID_BUS_PER) <> COALESCE(i.ID_BUS_REE, i.ID_BUS_PER)
           OR EXISTS (SELECT i.SALIDA_PLAN_UTC, i.LLEGADA_PLAN_UTC EXCEPT SELECT d.SALIDA_PLAN_UTC, d.LLEGADA_PLAN_UTC))
          THEN 1 ELSE 0 END,
        CASE WHEN UPPER(LTRIM(RTRIM(ISNULL(i.EST_VIA_HOJ, '')))) IN ('CANCELADA', 'CANCELADO') THEN 0 ELSE 1 END
    )) m(MOVIDA, OCUPA)
    WHERE m.MOVIDA = 1 OR (m.OCUPA = 1 AND
        (d.ID_HOJ IS NULL OR UPPER(LTRIM(RTRIM(ISNULL(d.EST_VIA_HOJ, '')))) IN ('CANCELADA', 'CANCELADO')));
    IF NOT EXISTS (SELECT 1 FROM @Cambios) RETURN;

    EXEC dbo.cc_BloquearOperacion;

    IF EXISTS (SELECT 1 FROM @Cambios c JOIN dbo.v_CC_BoletosConCupo b ON b.ID_HOJ_PER = c.ID_HOJ WHERE c.MOVIDA = 1)
        THROW 51205, 'La salida tiene boletos activos; no se puede cambiar su bus, frecuencia o fecha.', 1;

    IF EXISTS (
        SELECT 1 FROM @Cambios c
        WHERE c.OCUPA = 1
          AND NOT EXISTS (SELECT 1 FROM dbo.fn_CC_HojaVigente(c.ID_HOJ, NULL))
    )
        THROW 51206, 'La frecuencia no está activa o no cubre la fecha completa de la salida.', 1;
END;
GO

-- Protección de boletos sin cupo de pasajeros ni RESOLUCIONES_ANT:
-- mantiene integridad de salida vigente y pertenencia del asiento al bus operativo.
CREATE OR ALTER TRIGGER dbo.TR_CC_Boletos ON dbo.BOLETOS AFTER INSERT, UPDATE AS
BEGIN
    SET NOCOUNT ON;
    DECLARE @Nuevos TABLE (ID_HOJ varchar(5), ID_ASI varchar(5));
    INSERT @Nuevos
    SELECT i.ID_HOJ_PER, i.ID_ASI_PER
    FROM inserted i
    JOIN dbo.v_CC_BoletosConCupo v ON v.ID_BOL = i.ID_BOL
    LEFT JOIN deleted d ON d.ID_BOL = i.ID_BOL
    WHERE d.ID_BOL IS NULL
       OR i.ID_HOJ_PER <> d.ID_HOJ_PER
       OR i.ID_ASI_PER <> d.ID_ASI_PER
       OR UPPER(LTRIM(RTRIM(ISNULL(d.EST_BOL, '')))) IN
          ('CANCELADO', 'CANCELADA', 'ANULADO', 'ANULADA', 'INVALIDO', 'INVALIDA', 'VENCIDO', 'VENCIDA', 'RECHAZADO', 'RECHAZADA');
    IF NOT EXISTS (SELECT 1 FROM @Nuevos) RETURN;

    EXEC dbo.cc_BloquearOperacion;

    IF EXISTS (
        SELECT 1
        FROM @Nuevos n
        JOIN dbo.HOJAS_RUTAS h WITH(HOLDLOCK) ON h.ID_HOJ = n.ID_HOJ
        WHERE UPPER(LTRIM(RTRIM(ISNULL(h.EST_VIA_HOJ, '')))) NOT IN ('PROGRAMADO', 'PROGRAMADA', 'EN CURSO')
           OR NOT EXISTS (SELECT 1 FROM dbo.fn_CC_HojaVigente(n.ID_HOJ, dbo.fn_CC_FechaEcuador(SYSUTCDATETIME())))
           OR NOT EXISTS (
               SELECT 1 FROM dbo.ASIENTOS_BUS a
               WHERE a.ID_ASI = n.ID_ASI AND a.ID_BUS_PER = COALESCE(h.ID_BUS_REE, h.ID_BUS_PER)
           )
    )
        THROW 51208, 'La salida no está vigente o el asiento no pertenece al bus operativo.', 1;
END;
GO

-- Si CC-02 (013_hojas_ruta_lotes.sql) está instalado, desacoplar TR_CC02_Programacion de RESOLUCIONES_ANT
IF OBJECT_ID('dbo.BUS_CATEGORIAS', 'U') IS NOT NULL
   AND OBJECT_ID('dbo.fn_CC02_HojasEnConflicto', 'IF') IS NOT NULL
   AND OBJECT_ID('dbo.fn_CC02_PersonalConReserva', 'IF') IS NOT NULL
BEGIN
    EXEC(N'
    CREATE OR ALTER TRIGGER dbo.TR_CC02_Programacion ON dbo.HOJAS_RUTAS AFTER INSERT, UPDATE AS
    BEGIN
        SET NOCOUNT ON;
        DECLARE @Cambios table(ID_HOJ varchar(5) PRIMARY KEY, ID_COP varchar(5), ID_CAT varchar(24),
            ID_BUS varchar(5), ID_CHO varchar(10), ID_CON varchar(10), INICIO datetime2, FIN datetime2);
        INSERT @Cambios
        SELECT i.ID_HOJ, f.ID_COP_PER, f.ID_CAT_OP, COALESCE(i.ID_BUS_REE, i.ID_BUS_PER), i.ID_USU_CHO,
            i.ID_USU_CON, i.SALIDA_PLAN_UTC, i.LLEGADA_PLAN_UTC
        FROM inserted i
        LEFT JOIN deleted d ON d.ID_HOJ = i.ID_HOJ
        JOIN dbo.FRECUENCIAS f ON f.ID_FRE = i.ID_FRE_PER
        WHERE f.ID_CAT_OP IS NOT NULL
          AND i.EST_VIA_HOJ IN (''PROGRAMADO'', ''PROGRAMADA'', ''EN CURSO'')
          AND (d.ID_HOJ IS NULL OR d.EST_VIA_HOJ IS NULL OR d.EST_VIA_HOJ NOT IN (''PROGRAMADO'', ''PROGRAMADA'', ''EN CURSO'') OR EXISTS (
            SELECT i.ID_BUS_PER, i.ID_BUS_REE, i.ID_FRE_PER, i.ID_USU_CHO, i.ID_USU_CON, i.SALIDA_PLAN_UTC, i.LLEGADA_PLAN_UTC
            EXCEPT SELECT d.ID_BUS_PER, d.ID_BUS_REE, d.ID_FRE_PER, d.ID_USU_CHO, d.ID_USU_CON, d.SALIDA_PLAN_UTC, d.LLEGADA_PLAN_UTC
          ));
        IF NOT EXISTS (SELECT 1 FROM @Cambios) RETURN;

        EXEC dbo.cc_BloquearOperacion;
        IF EXISTS (
          SELECT 1 FROM @Cambios x
          LEFT JOIN dbo.BUSES b WITH(HOLDLOCK) ON b.ID_BUS = x.ID_BUS AND b.ID_COP_PER = x.ID_COP
             AND b.EST_BUS IN (''ACTIVO'', ''PARADA'', ''OPERANDO'', ''1'')
          LEFT JOIN dbo.BUS_CATEGORIAS bc WITH(HOLDLOCK) ON bc.ID_BUS = b.ID_BUS AND bc.ID_CAT = x.ID_CAT
          LEFT JOIN dbo.USUARIOS d WITH(HOLDLOCK) ON d.ID_USU = x.ID_CHO AND d.ID_COP_PER = x.ID_COP AND d.ID_ROL_PER = ''R006'' AND d.EST_USU = ''1''
          LEFT JOIN dbo.USUARIOS c WITH(HOLDLOCK) ON c.ID_USU = x.ID_CON AND c.ID_COP_PER = x.ID_COP AND c.ID_ROL_PER = ''R004'' AND c.EST_USU = ''1''
          WHERE bc.ID_BUS IS NULL OR d.ID_USU IS NULL OR c.ID_USU IS NULL
             OR x.INICIO IS NULL OR x.FIN IS NULL
             OR NOT EXISTS (SELECT 1 FROM dbo.ASIENTOS_BUS a WHERE a.ID_BUS_PER = x.ID_BUS)
        ) THROW 51303, ''El bus debe admitir la categoría y tener asientos; la tripulación y el horario deben estar completos y activos.'', 1;

        IF EXISTS (
          SELECT 1 FROM @Cambios x CROSS APPLY dbo.fn_CC02_HojasEnConflicto(x.INICIO, x.FIN) h
          WHERE h.ID_HOJ <> x.ID_HOJ
            AND (h.ID_BUS = x.ID_BUS OR h.ID_USU_CHO IN (x.ID_CHO, x.ID_CON) OR h.ID_USU_CON IN (x.ID_CHO, x.ID_CON))
        ) OR EXISTS (
          SELECT 1 FROM @Cambios x CROSS APPLY dbo.fn_CC02_PersonalConReserva(x.INICIO, x.FIN) p
          WHERE p.ID_USU_FIN IN (x.ID_CHO, x.ID_CON)
        ) THROW 51304, ''El bus o la tripulación ya tienen una asignación o reserva incompatible en ese intervalo.'', 1;
    END;
    ');
END;
GO
