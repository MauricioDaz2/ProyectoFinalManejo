-- RFC-000079: Plantillas editables de asientos, carga local de foto de bus,
-- hora de salida y tarifa base en frecuencias, categoría única por bus y tipos de asiento.
SET XACT_ABORT ON;
BEGIN TRY
    BEGIN TRANSACTION;

    -- 1. Columnas de plantilla y modelo de estructura en BUSES
    IF COL_LENGTH('dbo.BUSES', 'MOD_PLA_BUS') IS NULL
        ALTER TABLE dbo.BUSES ADD MOD_PLA_BUS varchar(30) NULL;

    IF COL_LENGTH('dbo.BUSES', 'PLANTILLA_JSON') IS NULL
        ALTER TABLE dbo.BUSES ADD PLANTILLA_JSON nvarchar(max) NULL;

    -- 2. Posición espacial (fila, columna, ubicación ventana/pasillo/centro) en ASIENTOS_BUS
    IF COL_LENGTH('dbo.ASIENTOS_BUS', 'FIL_ASI') IS NULL
        ALTER TABLE dbo.ASIENTOS_BUS ADD FIL_ASI int NULL;

    IF COL_LENGTH('dbo.ASIENTOS_BUS', 'COL_ASI') IS NULL
        ALTER TABLE dbo.ASIENTOS_BUS ADD COL_ASI int NULL;

    IF COL_LENGTH('dbo.ASIENTOS_BUS', 'UBI_ASI') IS NULL
        ALTER TABLE dbo.ASIENTOS_BUS ADD UBI_ASI varchar(15) NULL;

    -- 3. Tipos de asientos estándar (incluyendo DISCAPACIDAD y VIP)
    IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP01')
        INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP01', 'NORMAL', 0);

    IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP02')
        INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP02', 'VIP', 3);

    IF NOT EXISTS (SELECT 1 FROM dbo.TIPOS_ASIENTOS WHERE ID_TIP = 'TIP03')
        INSERT INTO dbo.TIPOS_ASIENTOS (ID_TIP, NOM_TIP, PRE_TIP) VALUES ('TIP03', 'DISCAPACIDAD', 0);

    -- 4. Número oficial de resolución ANT (visible al usuario en lugar del ID interno)
    IF COL_LENGTH('dbo.RESOLUCIONES_ANT', 'NUM_DOC_RES') IS NULL
        ALTER TABLE dbo.RESOLUCIONES_ANT ADD NUM_DOC_RES varchar(40) NULL;

    -- 5. Hora de salida y Tarifa base en FRECUENCIAS
    IF COL_LENGTH('dbo.FRECUENCIAS', 'HORA_SAL_FRE') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD HORA_SAL_FRE varchar(5) NULL;

    IF COL_LENGTH('dbo.FRECUENCIAS', 'TAR_BAS_FRE') IS NULL
        ALTER TABLE dbo.FRECUENCIAS ADD TAR_BAS_FRE decimal(10, 2) NULL;

    -- Inicializar valores por defecto en registros históricos si existen
    EXEC(N'
        UPDATE dbo.FRECUENCIAS SET HORA_SAL_FRE = ''08:00'' WHERE HORA_SAL_FRE IS NULL;
        UPDATE dbo.FRECUENCIAS SET TAR_BAS_FRE = 5.00 WHERE TAR_BAS_FRE IS NULL;
        UPDATE dbo.RESOLUCIONES_ANT SET NUM_DOC_RES = ''ANT-'' + ID_RES WHERE NUM_DOC_RES IS NULL;
    ');

    -- 6. Semilla base del catálogo territorial (Provincias, Cantones, Parroquias y Puntos) si está vacío
    IF OBJECT_ID('dbo.CAT_PUNTOS_TRAYECTO', 'U') IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM dbo.CAT_PUNTOS_TRAYECTO)
    BEGIN
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PROVINCIAS WHERE ID_PRO = '18')
            INSERT INTO dbo.CAT_PROVINCIAS (ID_PRO, NOM_PRO) VALUES ('18', N'Tungurahua');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PROVINCIAS WHERE ID_PRO = '17')
            INSERT INTO dbo.CAT_PROVINCIAS (ID_PRO, NOM_PRO) VALUES ('17', N'Pichincha');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PROVINCIAS WHERE ID_PRO = '09')
            INSERT INTO dbo.CAT_PROVINCIAS (ID_PRO, NOM_PRO) VALUES ('09', N'Guayas');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PROVINCIAS WHERE ID_PRO = '01')
            INSERT INTO dbo.CAT_PROVINCIAS (ID_PRO, NOM_PRO) VALUES ('01', N'Azuay');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PROVINCIAS WHERE ID_PRO = '06')
            INSERT INTO dbo.CAT_PROVINCIAS (ID_PRO, NOM_PRO) VALUES ('06', N'Chimborazo');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PROVINCIAS WHERE ID_PRO = '05')
            INSERT INTO dbo.CAT_PROVINCIAS (ID_PRO, NOM_PRO) VALUES ('05', N'Cotopaxi');

        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_CANTONES WHERE ID_CAN = '1801')
            INSERT INTO dbo.CAT_CANTONES (ID_CAN, ID_PRO, NOM_CAN) VALUES ('1801', '18', N'Ambato');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_CANTONES WHERE ID_CAN = '1802')
            INSERT INTO dbo.CAT_CANTONES (ID_CAN, ID_PRO, NOM_CAN) VALUES ('1802', '18', N'Baños de Agua Santa');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_CANTONES WHERE ID_CAN = '1701')
            INSERT INTO dbo.CAT_CANTONES (ID_CAN, ID_PRO, NOM_CAN) VALUES ('1701', '17', N'Quito');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_CANTONES WHERE ID_CAN = '0901')
            INSERT INTO dbo.CAT_CANTONES (ID_CAN, ID_PRO, NOM_CAN) VALUES ('0901', '09', N'Guayaquil');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_CANTONES WHERE ID_CAN = '0101')
            INSERT INTO dbo.CAT_CANTONES (ID_CAN, ID_PRO, NOM_CAN) VALUES ('0101', '01', N'Cuenca');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_CANTONES WHERE ID_CAN = '0601')
            INSERT INTO dbo.CAT_CANTONES (ID_CAN, ID_PRO, NOM_CAN) VALUES ('0601', '06', N'Riobamba');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_CANTONES WHERE ID_CAN = '0501')
            INSERT INTO dbo.CAT_CANTONES (ID_CAN, ID_PRO, NOM_CAN) VALUES ('0501', '05', N'Latacunga');

        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '180101')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('180101', '1801', N'Ambato Matriz');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '180102')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('180102', '1801', N'Huachi Grande');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '180201')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('180201', '1802', N'Baños Matriz');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '170101')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('170101', '1701', N'Quitumbe');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '090101')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('090101', '0901', N'Tarqui');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '010101')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('010101', '0101', N'El Sagrario');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '060101')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('060101', '0601', N'Lizarzaburu');
        IF NOT EXISTS (SELECT 1 FROM dbo.CAT_PARROQUIAS WHERE ID_PAR = '050101')
            INSERT INTO dbo.CAT_PARROQUIAS (ID_PAR, ID_CAN, NOM_PAR) VALUES ('050101', '0501', N'La Matriz');

        INSERT INTO dbo.CAT_PUNTOS_TRAYECTO (ID_PAR, NOM_PUN, ETIQUETA) VALUES
            ('180101', N'Terminal Terrestre Ingahurco (Ambato)', 'AMBATO'),
            ('180102', N'Terminal Sur Huachi Grande', 'HUACHI'),
            ('180201', N'Terminal Terrestre Baños', 'BANOS'),
            ('170101', N'Terminal Terrestre Quitumbe (Quito)', 'Quito'),
            ('090101', N'Terminal Terrestre de Guayaquil', 'Guayaquil'),
            ('010101', N'Terminal Terrestre de Cuenca', 'Cuenca'),
            ('060101', N'Terminal Terrestre de Riobamba', 'RIOBAMBA'),
            ('050101', N'Terminal Terrestre de Latacunga', 'LATACUNGA');

        -- Conciliar frecuencias existentes con sus puntos de catálogo y cupos
        UPDATE f
        SET f.ID_PUN_ORI = po.ID_PUN,
            f.ID_PUN_DES = pd.ID_PUN,
            f.MAX_UNIDADES = ISNULL(f.MAX_UNIDADES, 10),
            f.MAX_PASAJEROS = ISNULL(f.MAX_PASAJEROS, 400),
            f.ID_CAT_OP = ISNULL(f.ID_CAT_OP, 'INTERPROVINCIAL')
        FROM dbo.FRECUENCIAS f
        JOIN dbo.CAT_PUNTOS_TRAYECTO po ON UPPER(po.ETIQUETA) = UPPER(f.CIU_ORI_FRE)
        JOIN dbo.CAT_PUNTOS_TRAYECTO pd ON UPPER(pd.ETIQUETA) = UPPER(f.CIU_DES_FRE)
        WHERE f.ID_PUN_ORI IS NULL;
    END;

    -- 7. Restricción de categoría única por bus en BUS_CATEGORIAS (si la tabla existe)
    IF OBJECT_ID('dbo.BUS_CATEGORIAS', 'U') IS NOT NULL
    BEGIN
        -- Conservar solo 1 categoría por bus si algún bus tenía varias asignadas
        ;WITH Duplicadas AS (
            SELECT ID_BUS, ID_CAT,
                   ROW_NUMBER() OVER (PARTITION BY ID_BUS ORDER BY ID_CAT) AS rn
            FROM dbo.BUS_CATEGORIAS
        )
        DELETE FROM Duplicadas WHERE rn > 1;

        IF NOT EXISTS (SELECT 1 FROM sys.indexes WHERE object_id = OBJECT_ID('dbo.BUS_CATEGORIAS') AND name = 'UQ_BUS_CATEGORIA_UNICA')
            CREATE UNIQUE INDEX UQ_BUS_CATEGORIA_UNICA ON dbo.BUS_CATEGORIAS(ID_BUS);
    END;

    COMMIT TRANSACTION;
END TRY
BEGIN CATCH
    IF @@TRANCOUNT > 0 ROLLBACK TRANSACTION;
    THROW;
END CATCH;
GO
